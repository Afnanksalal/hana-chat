import { CreateMediaAssetRequestSchema } from "@hana/contracts";
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

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180) || "upload";
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
