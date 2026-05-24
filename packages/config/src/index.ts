import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const optionalE164PhoneSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
);
let dotenvLoaded = false;

function findEnvFile(startDirectory: string): string | undefined {
  let currentDirectory = startDirectory;

  while (true) {
    const candidate = join(currentDirectory, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return undefined;
    }

    currentDirectory = parentDirectory;
  }
}

function loadLocalEnvFile(): void {
  if (dotenvLoaded) {
    return;
  }

  dotenvLoaded = true;
  const envFilePath = findEnvFile(process.cwd());

  if (envFilePath) {
    loadDotenv({ path: envFilePath, override: false });
  }
}

const placeholderSecrets = new Set([
  "replace-with-32-byte-secret",
  "replace-with-at-least-32-random-chars",
  "replace-with-32-byte-session-secret",
  "replace-with-32-byte-base64-key",
  "replace-with-xai-key",
  "replace-with-razorpay-key-id",
  "replace-with-razorpay-key-secret",
  "replace-with-razorpay-webhook-secret",
  "replace-with-twilio-account-sid",
  "replace-with-twilio-auth-token",
  "replace-with-twilio-verify-service-sid",
  "change-this-postgres-password",
  "change-this-neo4j-password",
  "change-this-clickhouse-password",
  "hana_dev_password",
  "hana_neo4j_password",
  "hana_clickhouse_password",
]);

export const AppConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: portSchema.default(5432),
    POSTGRES_USER: z.string().default("hana"),
    POSTGRES_PASSWORD: z.string().default("hana_dev_password"),
    POSTGRES_DATABASE: z.string().default("hana"),

    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    QDRANT_URL: z.string().url().default("http://localhost:6333"),
    QDRANT_MEMORY_COLLECTION: z.string().default("hana_memory_facts"),
    QDRANT_CHARACTER_COLLECTION: z.string().default("hana_character_profiles"),
    NEO4J_URI: z.string().default("bolt://localhost:7687"),
    NEO4J_USER: z.string().default("neo4j"),
    NEO4J_PASSWORD: z.string().default("hana_neo4j_password"),
    CLICKHOUSE_URL: z.string().url().default("http://localhost:8123"),
    CLICKHOUSE_USER: z.string().default("hana"),
    CLICKHOUSE_PASSWORD: z.string().default("hana_clickhouse_password"),

    REDPANDA_BROKERS: z.string().default("localhost:19092"),
    TEMPORAL_ADDRESS: z.string().default("localhost:7233"),

    XAI_API_KEY: z.string().optional(),
    XAI_BASE_URL: z.string().url().default("https://api.x.ai/v1"),
    XAI_DEFAULT_MODEL: z.string().default("grok-4.3"),

    MEDIA_STORAGE_DIR: z.string().default(join(process.cwd(), "data", "media")),
    MEDIA_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(20 * 1024 * 1024)
      .default(5 * 1024 * 1024),

    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    RAZORPAYX_ACCOUNT_NUMBER: z.string().optional(),
    CREATOR_PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(9_000).default(3_000),
    CREATOR_EARNING_HOLD_DAYS: z.coerce.number().int().min(0).max(90).default(7),
    CREATOR_MIN_PAYOUT_CENTS: z.coerce.number().int().min(100).max(1_000_000).default(1_000),
    CREATOR_PAID_CHARACTER_TRIAL_MESSAGES: z.coerce.number().int().min(0).max(200).default(30),

    PHONE_HASH_SECRET: z.string().default("replace-with-32-byte-secret"),
    PHONE_ENCRYPTION_KEY_BASE64: z.string().default("replace-with-32-byte-base64-key"),
    SESSION_SECRET: z.string().default("replace-with-32-byte-session-secret"),
    AUTH_COOKIE_NAME: z.string().default("hana_session"),
    DEV_ADMIN_PHONE_NUMBER: optionalE164PhoneSchema,
    ADMIN_OTP_BYPASS_PHONE_NUMBER: optionalE164PhoneSchema,
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    WEB_ORIGINS: z.string().default("http://localhost:3000"),
    API_GATEWAY_URL: z.string().url().default("http://localhost:4000"),
    IDENTITY_SERVICE_URL: z.string().url().default("http://localhost:4010"),
    RISK_SERVICE_URL: z.string().url().default("http://localhost:4020"),
    CHAT_ORCHESTRATOR_URL: z.string().url().default("http://localhost:4030"),
    MEMORY_SERVICE_URL: z.string().url().default("http://localhost:4040"),
    RETRIEVAL_SERVICE_URL: z.string().url().default("http://localhost:4050"),
    GRAPH_SERVICE_URL: z.string().url().default("http://localhost:4060"),
    MODERATION_SERVICE_URL: z.string().url().default("http://localhost:4070"),
    BILLING_SERVICE_URL: z.string().url().default("http://localhost:4080"),
    CREATOR_SERVICE_URL: z.string().url().default("http://localhost:4090"),
    NOTIFICATION_SERVICE_URL: z.string().url().default("http://localhost:4100"),
    BATCH_ORCHESTRATOR_URL: z.string().url().default("http://localhost:4110"),
    WORKER_SERVICE_URL: z.string().url().default("http://localhost:4120"),
    API_GATEWAY_PORT: portSchema.default(4000),
    IDENTITY_SERVICE_PORT: portSchema.default(4010),
    RISK_SERVICE_PORT: portSchema.default(4020),
    CHAT_ORCHESTRATOR_PORT: portSchema.default(4030),
    MEMORY_SERVICE_PORT: portSchema.default(4040),
    RETRIEVAL_SERVICE_PORT: portSchema.default(4050),
    GRAPH_SERVICE_PORT: portSchema.default(4060),
    MODERATION_SERVICE_PORT: portSchema.default(4070),
    BILLING_SERVICE_PORT: portSchema.default(4080),
    CREATOR_SERVICE_PORT: portSchema.default(4090),
    NOTIFICATION_SERVICE_PORT: portSchema.default(4100),
    BATCH_ORCHESTRATOR_PORT: portSchema.default(4110),
    WORKER_SERVICE_PORT: portSchema.default(4120),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== "production") {
      return;
    }

    for (const key of ["PHONE_HASH_SECRET", "SESSION_SECRET"] as const) {
      const value = config[key];

      if (placeholderSecrets.has(value) || value.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be a non-placeholder secret with at least 32 characters in production`,
        });
      }
    }

    if (!isValidAesKey(config.PHONE_ENCRYPTION_KEY_BASE64)) {
      ctx.addIssue({
        code: "custom",
        path: ["PHONE_ENCRYPTION_KEY_BASE64"],
        message: "PHONE_ENCRYPTION_KEY_BASE64 must decode to a 32-byte key in production",
      });
    }

    if (isMissingOrPlaceholder(config.XAI_API_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["XAI_API_KEY"],
        message: "XAI_API_KEY must be configured with a non-placeholder value in production",
      });
    }

    for (const key of [
      "POSTGRES_PASSWORD",
      "NEO4J_PASSWORD",
      "CLICKHOUSE_PASSWORD",
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "RAZORPAY_WEBHOOK_SECRET",
      "RAZORPAYX_ACCOUNT_NUMBER",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_VERIFY_SERVICE_SID",
    ] as const) {
      if (isMissingOrPlaceholder(config[key])) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be configured with a non-placeholder value in production`,
        });
      }
    }

    if (config.DEV_ADMIN_PHONE_NUMBER) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_ADMIN_PHONE_NUMBER"],
        message: "DEV_ADMIN_PHONE_NUMBER must not be configured in production",
      });
    }

    validateProductionUrl(ctx, "WEB_ORIGIN", config.WEB_ORIGIN);
    validateProductionUrl(ctx, "API_GATEWAY_URL", config.API_GATEWAY_URL);
    validateProductionOrigins(ctx, config.WEB_ORIGINS);
  });

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(env?: NodeJS.ProcessEnv): AppConfig {
  loadLocalEnvFile();
  return AppConfigSchema.parse(env ?? process.env);
}

export function postgresConnectionString(config: AppConfig): string {
  const user = encodeURIComponent(config.POSTGRES_USER);
  const password = encodeURIComponent(config.POSTGRES_PASSWORD);
  const database = encodeURIComponent(config.POSTGRES_DATABASE);

  return `postgres://${user}:${password}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${database}`;
}

function isValidAesKey(value: string): boolean {
  if (placeholderSecrets.has(value)) {
    return false;
  }

  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function isMissingOrPlaceholder(value: string | undefined): boolean {
  return !value || placeholderSecrets.has(value);
}

function validateProductionUrl(
  ctx: z.RefinementCtx,
  key: "WEB_ORIGIN" | "API_GATEWAY_URL",
  value: string,
): void {
  if (value.includes("localhost") || value.includes("127.0.0.1") || !value.startsWith("https://")) {
    ctx.addIssue({
      code: "custom",
      path: [key],
      message: `${key} must be an HTTPS production URL`,
    });
  }
}

function validateProductionOrigins(ctx: z.RefinementCtx, value: string): void {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!origins.length) {
    ctx.addIssue({
      code: "custom",
      path: ["WEB_ORIGINS"],
      message: "WEB_ORIGINS must include at least one HTTPS production origin",
    });
    return;
  }

  for (const origin of origins) {
    if (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      !origin.startsWith("https://")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGINS"],
        message: "WEB_ORIGINS must contain only HTTPS production origins",
      });
      return;
    }
  }
}
