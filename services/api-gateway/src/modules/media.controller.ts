import { CreateMediaAssetRequestSchema, GenerateMediaAssetRequestSchema } from "@hana/contracts";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Param, Post, Res } from "@nestjs/common";
import { loadConfig } from "@hana/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { auditEvent, requireSession } from "./session";

interface BinaryReply {
  header(name: string, value: string | number): BinaryReply;
  status(statusCode: number): BinaryReply;
  send(payload: unknown): void;
}

const mimeExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
const fallbackMediaSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Hana media fallback"><rect width="96" height="96" rx="12" fill="#050507"/><circle cx="48" cy="48" r="22" fill="#ff1f6d"/><circle cx="48" cy="48" r="11" fill="#050507"/></svg>`,
);
const generatedImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;

interface ReferenceImage {
  dataUri: string;
  mediaId: string;
  mimeType: keyof typeof mimeExtensions;
  byteSize: number;
}

@Controller("/v1/media")
export class MediaController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);
  private readonly storageRoot = resolve(this.config.MEDIA_STORAGE_DIR);

  @Post()
  public async create(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateMediaAssetRequestSchema.parse(body);
    const buffer = decodeImagePayload(input.contentBase64);

    if (buffer.byteLength > this.config.MEDIA_MAX_UPLOAD_BYTES) {
      throw new DomainError("VALIDATION_FAILED", "Image is too large", {
        maxBytes: this.config.MEDIA_MAX_UPLOAD_BYTES,
      });
    }

    assertImageSignature(buffer, input.mimeType);

    const mediaId = randomUUID();
    const extension = mimeExtensions[input.mimeType];
    const storageKey = `${session.userId}/${mediaId}.${extension}`;
    const absolutePath = this.resolveStorageKey(storageKey);
    const publicUrl = `/api/v1/media/${mediaId}/file`;

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: "wx" });

    await this.db
      .insertInto("creator.media_assets")
      .values({
        id: mediaId,
        owner_user_id: session.userId,
        purpose: input.purpose,
        storage_provider: "local",
        storage_key: storageKey,
        public_url: publicUrl,
        original_file_name: sanitizeFileName(input.fileName),
        mime_type: input.mimeType,
        byte_size: buffer.byteLength,
        sha256_hex: createHash("sha256").update(buffer).digest("hex"),
        width: null,
        height: null,
        metadata_json: {},
      })
      .execute();

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "media.upload",
      resourceType: "creator.media_asset",
      resourceId: mediaId,
      metadata: {
        purpose: input.purpose,
        mimeType: input.mimeType,
        byteSize: buffer.byteLength,
      },
    });

    return {
      id: mediaId,
      url: publicUrl,
      purpose: input.purpose,
      mimeType: input.mimeType,
      byteSize: buffer.byteLength,
      fileName: input.fileName,
    };
  }

  @Post("/generate")
  public async generate(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = GenerateMediaAssetRequestSchema.parse(body);

    if (!this.config.XAI_API_KEY) {
      throw new DomainError("MODEL_PROVIDER_FAILED", "xAI image generation is not configured");
    }

    const recentGenerations = await this.db
      .selectFrom("creator.media_assets")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("owner_user_id", "=", session.userId)
      .where("created_at", ">=", new Date(Date.now() - 60 * 60 * 1_000))
      .where("metadata_json", "@>", { source: "xai-image-generation" })
      .executeTakeFirst();

    if (Number(recentGenerations?.count ?? 0) >= 12) {
      throw new DomainError("RATE_LIMITED", "Image generation rate limit reached", {
        retryAfterSeconds: 60 * 60,
      });
    }

    const referenceImage = input.referenceImageUrl
      ? await this.resolveReferenceImage(input.referenceImageUrl, session.userId)
      : null;
    const prompt = buildGeneratedImagePrompt({
      ...input,
      hasReferenceImage: Boolean(referenceImage),
    });
    const xaiImageInput: XaiImageInput = {
      apiKey: this.config.XAI_API_KEY,
      baseUrl: this.config.XAI_BASE_URL,
      model: this.config.XAI_IMAGE_MODEL,
      prompt,
      aspectRatio: input.aspectRatio,
    };

    if (referenceImage) {
      xaiImageInput.referenceImage = referenceImage;
    }

    const generated = await generateImageWithXai(xaiImageInput);

    if (generated.buffer.byteLength > this.config.MEDIA_MAX_UPLOAD_BYTES) {
      throw new DomainError("VALIDATION_FAILED", "Generated image is too large", {
        maxBytes: this.config.MEDIA_MAX_UPLOAD_BYTES,
      });
    }

    assertImageSignature(generated.buffer, generated.mimeType);

    const mediaId = randomUUID();
    const extension = mimeExtensions[generated.mimeType];
    const storageKey = `${session.userId}/${mediaId}.${extension}`;
    const absolutePath = this.resolveStorageKey(storageKey);
    const publicUrl = `/api/v1/media/${mediaId}/file`;
    const fileName = sanitizeFileName(
      `${input.characterName || input.purpose}-xai-${Date.now()}.${extension}`,
    );

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated.buffer, { flag: "wx" });

    await this.db
      .insertInto("creator.media_assets")
      .values({
        id: mediaId,
        owner_user_id: session.userId,
        purpose: input.purpose,
        storage_provider: "local",
        storage_key: storageKey,
        public_url: publicUrl,
        original_file_name: fileName,
        mime_type: generated.mimeType,
        byte_size: generated.buffer.byteLength,
        sha256_hex: createHash("sha256").update(generated.buffer).digest("hex"),
        width: null,
        height: null,
        metadata_json: {
          source: "xai-image-generation",
          mode: referenceImage ? "image_edit_reference" : "text_to_image",
          model: this.config.XAI_IMAGE_MODEL,
          prompt,
          revisedPrompt: generated.revisedPrompt,
          costTicks: generated.costTicks,
          referenceMediaId: referenceImage?.mediaId ?? null,
          referenceMimeType: referenceImage?.mimeType ?? null,
          referenceByteSize: referenceImage?.byteSize ?? null,
          purpose: input.purpose,
          aspectRatio: input.aspectRatio,
          artDirection: input.artDirection,
          mood: input.mood,
          backdrop: input.backdrop,
          detailLevel: input.detailLevel,
        },
      })
      .execute();

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "media.generate",
      resourceType: "creator.media_asset",
      resourceId: mediaId,
      metadata: {
        purpose: input.purpose,
        mimeType: generated.mimeType,
        byteSize: generated.buffer.byteLength,
        provider: "xai",
        model: this.config.XAI_IMAGE_MODEL,
        referenceMediaId: referenceImage?.mediaId ?? null,
      },
    });

    return {
      id: mediaId,
      url: publicUrl,
      purpose: input.purpose,
      mimeType: generated.mimeType,
      byteSize: generated.buffer.byteLength,
      fileName,
      provider: "xai",
      model: this.config.XAI_IMAGE_MODEL,
    };
  }

  @Get("/:mediaId/file")
  public async file(@Param("mediaId") mediaId: string, @Res() reply: BinaryReply): Promise<void> {
    const media = await this.db
      .selectFrom("creator.media_assets")
      .select(["storage_key", "mime_type", "byte_size"])
      .where("id", "=", mediaId)
      .executeTakeFirst();

    if (!media) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Media asset not found");
    }

    const file = await readMediaFile(this.resolveStorageKey(media.storage_key));
    const contentType = file.fallback ? "image/svg+xml; charset=utf-8" : media.mime_type;

    reply
      .header("Content-Type", contentType)
      .header("Content-Length", file.buffer.byteLength)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(file.buffer);
  }

  private resolveStorageKey(storageKey: string): string {
    const absolutePath = resolve(this.storageRoot, storageKey);
    const normalizedRoot = this.storageRoot.endsWith(sep)
      ? this.storageRoot
      : `${this.storageRoot}${sep}`;

    if (!absolutePath.startsWith(normalizedRoot)) {
      throw new DomainError("VALIDATION_FAILED", "Invalid media storage key");
    }

    return absolutePath;
  }

  private async resolveReferenceImage(
    referenceImageUrl: string,
    userId: string,
  ): Promise<ReferenceImage> {
    const mediaId = extractHanaMediaId(referenceImageUrl);

    if (!mediaId) {
      throw new DomainError("VALIDATION_FAILED", "Reference image must be an uploaded Hana image");
    }

    const media = await this.db
      .selectFrom("creator.media_assets")
      .select(["id", "storage_key", "mime_type", "byte_size"])
      .where("id", "=", mediaId)
      .where("owner_user_id", "=", userId)
      .executeTakeFirst();

    if (!media) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Reference image was not found");
    }

    if (!isSupportedGeneratedMimeType(media.mime_type)) {
      throw new DomainError("VALIDATION_FAILED", "Reference image type is not supported");
    }

    const buffer = await readFile(this.resolveStorageKey(media.storage_key));
    assertImageSignature(buffer, media.mime_type);

    return {
      dataUri: `data:${media.mime_type};base64,${buffer.toString("base64")}`,
      mediaId: media.id,
      mimeType: media.mime_type,
      byteSize: Number(media.byte_size ?? buffer.byteLength),
    };
  }
}

async function readMediaFile(absolutePath: string): Promise<{ buffer: Buffer; fallback: boolean }> {
  try {
    return { buffer: await readFile(absolutePath), fallback: false };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { buffer: fallbackMediaSvg, fallback: true };
    }

    throw error;
  }
}

function decodeImagePayload(contentBase64: string): Buffer {
  const payload = contentBase64.includes(",")
    ? contentBase64.slice(contentBase64.indexOf(",") + 1)
    : contentBase64;
  const buffer = Buffer.from(payload, "base64");

  if (buffer.byteLength === 0) {
    throw new DomainError("VALIDATION_FAILED", "Image payload is empty");
  }

  return buffer;
}

function assertImageSignature(buffer: Buffer, mimeType: keyof typeof mimeExtensions): void {
  const signatureMatches =
    (mimeType === "image/png" &&
      buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
    (mimeType === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (mimeType === "image/webp" &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP");

  if (!signatureMatches) {
    throw new DomainError("VALIDATION_FAILED", "Image file type does not match its content");
  }
}

function buildGeneratedImagePrompt(input: {
  purpose: "character_avatar" | "character_cover";
  prompt: string;
  characterName: string;
  style: string;
  artDirection: string;
  mood: string;
  backdrop: string;
  detailLevel: string;
  aspectRatio: "1:1" | "16:9" | "3:4" | "4:3";
  hasReferenceImage: boolean;
}): string {
  const framing =
    input.purpose === "character_avatar"
      ? "single fictional character portrait, shoulders-up, clear face, expressive eyes, clean readable silhouette"
      : "wide cinematic cover scene, environment-forward composition, character can be present but not cropped awkwardly";
  const nameLine = input.characterName ? `Character name: ${input.characterName}.` : "";

  const prompt = [
    "Create production-ready Hana Chat character art.",
    nameLine,
    `Use this style: ${input.style}.`,
    `Art direction preset: ${input.artDirection}.`,
    `Mood preset: ${input.mood}. Backdrop preset: ${input.backdrop}. Detail preset: ${input.detailLevel}.`,
    `Composition: ${framing}.`,
    `Aspect ratio: ${input.aspectRatio}.`,
    input.hasReferenceImage
      ? "A selected profile image is attached as the identity reference. Preserve the character's recognizable face, hair, body direction, outfit direction, and persona; expand them into the requested cover scene instead of inventing a different character."
      : "",
    "Use the palette implied by the character, mood, and backdrop. Do not force Hana brand colors, pink, magenta, or neon accents unless the prompt explicitly asks for them.",
    "Keep the asset readable on a dark app surface and avoid text, logos, watermarks, UI frames, and dialogue bubbles.",
    "No nudity, no sexualized minors, no photorealistic real-person likeness, no gore, and no non-image elements.",
    "Prompt:",
    input.prompt,
  ]
    .filter(Boolean)
    .join("\n");

  return clipProviderImagePrompt(prompt, 6_000);
}

function clipProviderImagePrompt(prompt: string, maxLength: number): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }

  return prompt.slice(0, maxLength - 24).trimEnd();
}

interface XaiImageInput {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  referenceImage?: ReferenceImage;
}

async function generateImageWithXai(input: XaiImageInput): Promise<{
  buffer: Buffer;
  mimeType: keyof typeof mimeExtensions;
  revisedPrompt: string;
  costTicks: number | null;
}> {
  const endpoint = input.referenceImage ? "/images/edits" : "/images/generations";
  const baseBody = {
    model: input.model,
    prompt: input.prompt,
    response_format: "url",
    n: 1,
  };
  const requestBody: Record<string, unknown> = input.referenceImage
    ? {
        ...baseBody,
        aspect_ratio: input.aspectRatio,
        image: {
          url: input.referenceImage.dataUri,
          type: "image_url",
        },
      }
    : {
        ...baseBody,
        aspect_ratio: input.aspectRatio,
      };
  let response = await postXaiImageRequest(input, endpoint, requestBody);

  if (!response.ok && input.referenceImage && isRetryableImageEditShapeError(response.status)) {
    const failureText = await response.text().catch(() => "");

    if (/aspect[_ -]?ratio|unknown|validation|schema/i.test(failureText)) {
      const fallbackBody = { ...requestBody };
      delete fallbackBody["aspect_ratio"];
      response = await postXaiImageRequest(input, endpoint, fallbackBody);
    } else {
      throw new DomainError("MODEL_PROVIDER_FAILED", "xAI image generation request failed", {
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    throw new DomainError("MODEL_PROVIDER_FAILED", "xAI image generation request failed", {
      status: response.status,
    });
  }

  const payload = (await response.json()) as {
    data?: Array<{
      url?: string;
      b64_json?: string;
      mime_type?: string;
      revised_prompt?: string;
    }>;
    usage?: {
      cost_in_usd_ticks?: number;
    };
  };
  const image = payload.data?.[0];

  if (!image) {
    throw new DomainError("MODEL_PROVIDER_FAILED", "xAI image response was empty");
  }

  if (image.b64_json) {
    const buffer = Buffer.from(image.b64_json, "base64");

    return {
      buffer,
      mimeType: mimeTypeFromPayloadOrSignature(image.mime_type, buffer),
      revisedPrompt: image.revised_prompt ?? "",
      costTicks: payload.usage?.cost_in_usd_ticks ?? null,
    };
  }

  if (!image.url) {
    throw new DomainError("MODEL_PROVIDER_FAILED", "xAI image response did not include an image");
  }

  const download = await fetchWithTimeout(image.url, { method: "GET" }, 60_000);

  if (!download.ok) {
    throw new DomainError("MODEL_PROVIDER_FAILED", "Could not download generated image", {
      status: download.status,
    });
  }

  const buffer = Buffer.from(await download.arrayBuffer());
  const headerMime = download.headers.get("content-type")?.split(";")[0]?.trim();

  return {
    buffer,
    mimeType: mimeTypeFromPayloadOrSignature(image.mime_type ?? headerMime, buffer),
    revisedPrompt: image.revised_prompt ?? "",
    costTicks: payload.usage?.cost_in_usd_ticks ?? null,
  };
}

async function postXaiImageRequest(
  input: {
    apiKey: string;
    baseUrl: string;
  },
  endpoint: "/images/generations" | "/images/edits",
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithTimeout(
    `${input.baseUrl.replace(/\/+$/, "")}${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    60_000,
  );
}

function isRetryableImageEditShapeError(status: number): boolean {
  return status === 400 || status === 422;
}

function mimeTypeFromPayloadOrSignature(
  mimeType: string | undefined,
  buffer: Buffer,
): keyof typeof mimeExtensions {
  if (generatedImageMimeTypes.some((candidate) => candidate === mimeType)) {
    return mimeType as keyof typeof mimeExtensions;
  }

  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return "image/png";
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  throw new DomainError("VALIDATION_FAILED", "Generated image type is not supported");
}

function isSupportedGeneratedMimeType(value: string): value is keyof typeof mimeExtensions {
  return generatedImageMimeTypes.some((candidate) => candidate === value);
}

function extractHanaMediaId(value: string): string | null {
  const trimmed = value.trim();
  const pathname =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? safeUrlPathname(trimmed)
      : trimmed;

  if (!pathname) {
    return null;
  }

  const match = pathname.match(/\/(?:api\/)?v1\/media\/([0-9a-fA-F-]{36})\/file(?:[?#].*)?$/);

  return match?.[1] ?? null;
}

function safeUrlPathname(value: string): string | null {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  return fetch(url, { ...init, signal: abortController.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180) || "upload";
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
