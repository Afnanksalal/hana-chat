import type { loadConfig } from "@hana/config";
import type { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const mimeExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

interface GenerateImageInput {
  db: ReturnType<typeof createDatabase>;
  config: ReturnType<typeof loadConfig>;
  userId: string;
  prompt: string;
  characterName?: string;
  purpose: "character_avatar" | "character_cover" | "nft_art";
  aspectRatio?: "1:1" | "16:9" | "3:4" | "4:3";
}

interface GenerateImageResult {
  mediaId: string;
  url: string;
  mimeType: keyof typeof mimeExtensions;
  byteSize: number;
}

/**
 * Shared utility for generating and saving images.
 * Used by media.controller and chat.controller.
 */
export async function generateAndSaveImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const { db, config, userId, prompt, characterName, purpose, aspectRatio = "1:1" } = input;

  const useXai = Boolean(config.XAI_API_KEY);

  const recentGenerations = await db
    .selectFrom("creator.media_assets")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("owner_user_id", "=", userId)
    .where("created_at", ">=", new Date(Date.now() - 60 * 60 * 1_000))
    .where("metadata_json", "@>", {
      source: useXai ? "xai-image-generation" : "pollinations-image-generation",
    })
    .executeTakeFirst();

  if (Number(recentGenerations?.count ?? 0) >= 12) {
    throw new DomainError("RATE_LIMITED", "Image generation rate limit reached", {
      retryAfterSeconds: 60 * 60,
    });
  }

  let generated;
  if (useXai) {
    try {
      generated = await generateImageWithXai({
        apiKey: config.XAI_API_KEY!,
        baseUrl: config.XAI_BASE_URL,
        model: config.XAI_IMAGE_MODEL,
        prompt: buildChatImagePrompt(prompt, characterName, purpose),
        aspectRatio,
      });
    } catch (error) {
      console.warn("xAI chat image generation failed, falling back to Pollinations:", error);
      generated = await generateImageWithPollinations(
        buildChatImagePrompt(prompt, characterName, purpose),
        aspectRatio,
      );
    }
  } else {
    generated = await generateImageWithPollinations(
      buildChatImagePrompt(prompt, characterName, purpose),
      aspectRatio,
    );
  }

  if (generated.buffer.byteLength > config.MEDIA_MAX_UPLOAD_BYTES) {
    throw new DomainError("VALIDATION_FAILED", "Generated image is too large", {
      maxBytes: config.MEDIA_MAX_UPLOAD_BYTES,
    });
  }

  assertImageSignature(generated.buffer, generated.mimeType);

  const mediaId = randomUUID();
  const extension = mimeExtensions[generated.mimeType];
  const storageKey = `${userId}/${mediaId}.${extension}`;
  const storageRoot = resolve(config.MEDIA_STORAGE_DIR);
  const absolutePath = resolve(storageRoot, storageKey);
  const normalizedRoot = storageRoot.endsWith(sep) ? storageRoot : `${storageRoot}${sep}`;

  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new DomainError("VALIDATION_FAILED", "Invalid media storage key");
  }

  const publicUrl = `/api/v1/media/${mediaId}/file`;
  const fileName = `${purpose}-${useXai ? "xai" : "pollinations"}-${Date.now()}.${extension}`;

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, generated.buffer, { flag: "wx" });

  await db
    .insertInto("creator.media_assets")
    .values({
      id: mediaId,
      owner_user_id: userId,
      purpose,
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
        source: `${useXai ? "xai" : "pollinations"}-image-generation`,
        mode: "text_to_image",
        model: useXai ? config.XAI_IMAGE_MODEL : "flux",
        prompt: buildChatImagePrompt(prompt, characterName, purpose),
        revisedPrompt: generated.revisedPrompt,
        costTicks: generated.costTicks,
        purpose,
        aspectRatio,
      },
    })
    .execute();

  return {
    mediaId,
    url: publicUrl,
    mimeType: generated.mimeType,
    byteSize: generated.buffer.byteLength,
  };
}

function buildChatImagePrompt(
  prompt: string,
  characterName?: string,
  purpose: "character_avatar" | "character_cover" | "nft_art" | "chat_image" = "chat_image",
): string {
  const nameLine = characterName ? `Character name: ${characterName}.` : "";

  const basePrompt = [
    "Create Hana Chat artwork.",
    nameLine,
    `Purpose: ${purpose}.`,
    "Use the palette implied by the character and mood. Do not force Hana brand colors, pink, magenta, or neon accents unless the prompt explicitly asks for them.",
    "Keep the asset readable on a dark app surface and avoid text, logos, watermarks, UI frames, and dialogue bubbles.",
    "No nudity, no sexualized minors, no photorealistic real-person likeness, no gore, and no non-image elements.",
    "Prompt:",
    prompt,
  ]
    .filter(Boolean)
    .join("\n");

  return basePrompt.length > 6_000 ? basePrompt.slice(0, 6_000 - 24).trimEnd() : basePrompt;
}

interface XaiImageInput {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  aspectRatio: string;
}

async function generateImageWithXai(input: XaiImageInput): Promise<{
  buffer: Buffer;
  mimeType: keyof typeof mimeExtensions;
  revisedPrompt: string;
  costTicks: number | null;
}> {
  const endpoint = "/images/generations";
  const requestBody = {
    model: input.model,
    prompt: input.prompt,
    response_format: "url",
    n: 1,
    aspect_ratio: input.aspectRatio,
  };

  const response = await fetchWithTimeout(
    `${input.baseUrl.replace(/\/+$/, "")}${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
    60_000,
  );

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

async function generateImageWithPollinations(
  prompt: string,
  aspectRatio: string,
): Promise<{
  buffer: Buffer;
  mimeType: keyof typeof mimeExtensions;
  revisedPrompt: string;
  costTicks: number | null;
}> {
  const dimensionMap: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1344, height: 768 },
    "4:3": { width: 1152, height: 896 },
    "3:4": { width: 896, height: 1152 },
  };
  const { width, height } = dimensionMap[aspectRatio] ?? { width: 1024, height: 1024 };

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: "flux",
    nologo: "true",
    enhance: "false",
    safe: "false",
    seed: String(Math.floor(Math.random() * 2_147_483_647)),
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

  const response = await fetchWithTimeout(url, { method: "GET" }, 90_000);

  if (!response.ok) {
    throw new DomainError("MODEL_PROVIDER_FAILED", "Pollinations image generation failed", {
      status: response.status,
    });
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    mimeType: mimeTypeFromPayloadOrSignature(contentType, buffer),
    revisedPrompt: "",
    costTicks: null,
  };
}

function mimeTypeFromPayloadOrSignature(
  mimeType: string | undefined,
  buffer: Buffer,
): keyof typeof mimeExtensions {
  const generatedImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;

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
