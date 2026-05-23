import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { E164PhoneNumberSchema, type PhoneNumberE164 } from "@hana/contracts";
import { DomainError } from "@hana/errors";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type PhoneLineType =
  | "mobile"
  | "landline"
  | "fixed_voip"
  | "non_fixed_voip"
  | "toll_free"
  | "unknown";

export interface PhoneCredential {
  id: string;
  userId: string;
  phoneHash: string;
  encryptedPhoneNumber: string;
  countryCode: string;
  lineType: PhoneLineType;
  carrierName?: string;
  verifiedAt: string;
  lastRiskCheckedAt?: string;
  isPrimary: boolean;
}

export interface StartVerificationInput {
  phoneNumber: PhoneNumberE164;
  deviceId?: string;
  riskSessionId?: string;
}

export interface VerifyCodeInput extends StartVerificationInput {
  code: string;
}

export interface PhoneVerificationProvider {
  start(input: StartVerificationInput): Promise<{ verificationId: string }>;
  verify(input: VerifyCodeInput): Promise<{ verified: boolean; providerUserId?: string }>;
}

export interface PhoneIntelligence {
  lineType: PhoneLineType;
  carrierName?: string;
  countryCode?: string;
  simSwapRisk?: "unknown" | "low" | "medium" | "high";
  portingRisk?: "unknown" | "low" | "medium" | "high";
  isReachable?: boolean;
}

export interface PhoneIntelligenceProvider {
  lookup(phoneNumber: PhoneNumberE164): Promise<PhoneIntelligence>;
}

export function normalizePhoneNumber(input: string, defaultCountry?: CountryCode): PhoneNumberE164 {
  const parsed = parsePhoneNumberFromString(input, defaultCountry);

  if (!parsed?.isValid()) {
    throw new DomainError("VALIDATION_FAILED", "Invalid phone number");
  }

  return E164PhoneNumberSchema.parse(parsed.number);
}

export function hashPhoneNumber(phoneNumber: PhoneNumberE164, secret: string): string {
  if (secret.length < 16) {
    throw new DomainError("INTERNAL", "Phone hash secret is too short");
  }

  return createHmac("sha256", secret).update(phoneNumber).digest("hex");
}

export interface EncryptedPhoneNumber {
  value: string;
  algorithm: "aes-256-gcm";
}

export function encryptPhoneNumber(
  phoneNumber: PhoneNumberE164,
  base64Key: string,
): EncryptedPhoneNumber {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new DomainError("INTERNAL", "Phone encryption key must be 32 bytes base64");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(phoneNumber, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    value: `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`,
  };
}

export function decryptPhoneNumber(encryptedValue: string, base64Key: string): PhoneNumberE164 {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new DomainError("INTERNAL", "Phone encryption key must be 32 bytes base64");
  }

  const [ivPart, tagPart, encryptedPart] = encryptedValue.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new DomainError("VALIDATION_FAILED", "Malformed encrypted phone number");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return E164PhoneNumberSchema.parse(decrypted);
}

export function shouldAllowLineType(lineType: PhoneLineType): "allow" | "challenge" | "block" {
  switch (lineType) {
    case "mobile":
      return "allow";
    case "unknown":
    case "fixed_voip":
      return "challenge";
    case "landline":
    case "non_fixed_voip":
    case "toll_free":
      return "block";
  }
}
