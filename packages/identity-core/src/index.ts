import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { EmailAddressSchema, type EmailAddress } from "@hana/contracts";
import { DomainError } from "@hana/errors";

export function normalizeEmailAddress(input: string): EmailAddress {
  return EmailAddressSchema.parse(input);
}

export function emailDomain(email: EmailAddress): string {
  const domain = email.split("@")[1];

  if (!domain) {
    throw new DomainError("VALIDATION_FAILED", "Invalid email address");
  }

  return domain;
}

export function hashEmailAddress(email: EmailAddress, secret: string): string {
  if (secret.length < 16) {
    throw new DomainError("INTERNAL", "Email hash secret is too short");
  }

  return createHmac("sha256", secret).update(email).digest("hex");
}

export interface EncryptedEmailAddress {
  value: string;
  algorithm: "aes-256-gcm";
}

export function encryptEmailAddress(
  email: EmailAddress,
  base64Key: string,
): EncryptedEmailAddress {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new DomainError("INTERNAL", "Email encryption key must be 32 bytes base64");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    value: `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`,
  };
}

export function decryptEmailAddress(encryptedValue: string, base64Key: string): EmailAddress {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new DomainError("INTERNAL", "Email encryption key must be 32 bytes base64");
  }

  const [ivPart, tagPart, encryptedPart] = encryptedValue.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new DomainError("VALIDATION_FAILED", "Malformed encrypted email address");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return EmailAddressSchema.parse(decrypted);
}
