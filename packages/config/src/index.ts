import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const booleanEnvSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", ""].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());
const optionalEmailSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().toLowerCase().email().optional(),
);
const stellarAssetCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z
    .string()
    .regex(
      /^[A-Z0-9]{1,12}$/,
      "Stellar payment asset code must be 1-12 uppercase alphanumeric characters",
    ),
);
const optionalStellarIssuerSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);
const localDevAesKeyBase64 = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
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
  "replace-with-agent-router-key",
  "replace-with-email-hash-secret",
  "replace-with-email-encryption-key",
  "replace-with-payout-encryption-key",
  "replace-with-smtp-password",
  "replace-with-sendgrid-api-key",
  "hana-local-dev-email-hash-secret-change-me",
  "hana-local-dev-session-secret-change-me",
  localDevAesKeyBase64,
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
    XAI_IMAGE_MODEL: z.string().default("grok-imagine-image-quality"),
    TEXT_MODEL_PROVIDER: z.enum(["xai", "agentrouter"]).default("xai"),
    TEXT_MODEL_FALLBACK_PROVIDER: z.enum(["none", "xai"]).default("none"),
    AGENT_ROUTER_API_KEY: z.string().optional(),
    AGENT_ROUTER_BASE_URL: z.string().url().default("https://agentrouter.org/v1"),
    AGENT_ROUTER_DEFAULT_MODEL: z.string().trim().min(1).default("deepseek-v3.2"),
    AGENT_ROUTER_COMPLEX_MODEL: z.string().trim().min(1).default("gpt-5.1"),
    AGENT_ROUTER_MEMORY_MODEL: z.string().trim().min(1).default("deepseek-v3.2"),
    TURN_MEMORY_FEEDBACK_ENABLED: booleanEnvSchema.default(true),

    MEDIA_STORAGE_DIR: z.string().default(join(process.cwd(), "data", "media")),
    MEDIA_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(20 * 1024 * 1024)
      .default(5 * 1024 * 1024),

    MONETIZATION_ENABLED: booleanEnvSchema.default(false),
    PAYOUT_ENCRYPTION_KEY_BASE64: z.string().default(localDevAesKeyBase64),
    CREATOR_PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(9_000).default(3_000),
    CREATOR_EARNING_HOLD_DAYS: z.coerce.number().int().min(0).max(90).default(7),
    CREATOR_MIN_PAYOUT_CENTS: z.coerce.number().int().min(100).max(1_000_000).default(1_000),
    CREATOR_PAID_CHARACTER_TRIAL_MESSAGES: z.coerce.number().int().min(0).max(200).default(30),

    STELLAR_ENABLED: booleanEnvSchema.default(false),
    STELLAR_STORAGE_ENABLED: booleanEnvSchema.default(false),
    STELLAR_PAYMENTS_ENABLED: booleanEnvSchema.default(false),
    STELLAR_NFT_ENABLED: booleanEnvSchema.default(false),
    STELLAR_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
    STELLAR_HORIZON_URL: z.string().url().default("https://horizon-testnet.stellar.org"),
    STELLAR_RPC_URL: z.string().url().default("https://soroban-testnet.stellar.org"),
    STELLAR_TREASURY_ADDRESS: z.string().optional(),
    STELLAR_NFT_CONTRACT_ID: z.string().optional(),
    STELLAR_SERVER_KEY_REF: z.string().optional(),
    STELLAR_PAYMENT_ASSET_CODE: stellarAssetCodeSchema.default("XLM"),
    STELLAR_PAYMENT_ASSET_ISSUER: optionalStellarIssuerSchema,
    STELLAR_PAYMENT_TOKEN_USD_CENTS: z.coerce.number().int().min(1).max(1_000_000).default(10),
    STELLAR_PAYMENT_INTENT_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(30),
    STELLAR_REQUIRED_CONFIRMATIONS: z.coerce.number().int().min(1).max(100).default(1),
    STELLAR_STORAGE_SNAPSHOT_INTERVAL_TURNS: z.coerce.number().int().min(1).max(10_000).default(25),
    STELLAR_STORAGE_SNAPSHOT_MIN_IMPORTANCE: z.coerce.number().min(0).max(1).default(0.65),

    EMAIL_HASH_SECRET: z.string().default("hana-local-dev-email-hash-secret-change-me"),
    EMAIL_ENCRYPTION_KEY_BASE64: z.string().default(localDevAesKeyBase64),
    AUTH_EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().min(3).max(30).default(10),
    AUTH_EMAIL_CODE_LENGTH: z.coerce.number().int().min(6).max(8).default(6),
    AUTH_MAX_EMAIL_CODE_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    AUTH_ONE_ACCOUNT_PER_IP: booleanEnvSchema.default(true),
    AUTH_ONE_ACCOUNT_PER_DEVICE: booleanEnvSchema.default(true),
    ADMIN_EMAIL: optionalEmailSchema,
    EMAIL_PROVIDER: z.enum(["local", "smtp", "sendgrid"]).default("smtp"),
    SENDGRID_API_KEY: z.string().optional(),
    SENDGRID_API_BASE_URL: z.string().url().default("https://api.sendgrid.com"),
    SENDGRID_FROM: z.string().default("Hana Chat <no-reply@app.hanachat.site>"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: portSchema.default(587),
    SMTP_SECURE: booleanEnvSchema.default(false),
    SMTP_IGNORE_TLS: booleanEnvSchema.default(false),
    SMTP_TLS_REJECT_UNAUTHORIZED: booleanEnvSchema.default(true),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default("Hana Chat <no-reply@app.hanachat.site>"),
    SMTP_POOL_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(3),
    SMTP_POOL_MAX_MESSAGES: z.coerce.number().int().min(1).max(10_000).default(100),

    SESSION_SECRET: z.string().default("hana-local-dev-session-secret-change-me"),
    AUTH_COOKIE_NAME: z.string().default("hana_session"),

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
    if (config.STELLAR_STORAGE_ENABLED && !config.STELLAR_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_STORAGE_ENABLED"],
        message: "STELLAR_STORAGE_ENABLED requires STELLAR_ENABLED",
      });
    }

    if (config.STELLAR_PAYMENTS_ENABLED && !config.STELLAR_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_PAYMENTS_ENABLED"],
        message: "STELLAR_PAYMENTS_ENABLED requires STELLAR_ENABLED",
      });
    }

    if (config.STELLAR_PAYMENTS_ENABLED && !config.MONETIZATION_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_PAYMENTS_ENABLED"],
        message: "STELLAR_PAYMENTS_ENABLED cannot bypass MONETIZATION_ENABLED",
      });
    }

    if (config.STELLAR_NFT_ENABLED && !config.STELLAR_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_NFT_ENABLED"],
        message: "STELLAR_NFT_ENABLED requires STELLAR_ENABLED",
      });
    }

    if (config.STELLAR_NFT_ENABLED && !config.STELLAR_PAYMENTS_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_NFT_ENABLED"],
        message: "STELLAR_NFT_ENABLED requires STELLAR_PAYMENTS_ENABLED",
      });
    }

    if (config.STELLAR_PAYMENT_ASSET_CODE === "XLM" && config.STELLAR_PAYMENT_ASSET_ISSUER) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_PAYMENT_ASSET_ISSUER"],
        message: "Native XLM payments must not configure STELLAR_PAYMENT_ASSET_ISSUER",
      });
    }

    if (config.STELLAR_PAYMENT_ASSET_CODE !== "XLM") {
      if (!config.STELLAR_PAYMENT_ASSET_ISSUER) {
        ctx.addIssue({
          code: "custom",
          path: ["STELLAR_PAYMENT_ASSET_ISSUER"],
          message: "Non-native Stellar payment assets require STELLAR_PAYMENT_ASSET_ISSUER",
        });
      } else if (!isLikelyStellarIssuer(config.STELLAR_PAYMENT_ASSET_ISSUER)) {
        ctx.addIssue({
          code: "custom",
          path: ["STELLAR_PAYMENT_ASSET_ISSUER"],
          message: "STELLAR_PAYMENT_ASSET_ISSUER must be a Stellar public key",
        });
      }
    }

    if (config.NODE_ENV !== "production") {
      return;
    }

    for (const key of ["EMAIL_HASH_SECRET", "SESSION_SECRET"] as const) {
      const value = config[key];

      if (placeholderSecrets.has(value) || value.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be a non-placeholder secret with at least 32 characters in production`,
        });
      }
    }

    if (
      placeholderSecrets.has(config.EMAIL_ENCRYPTION_KEY_BASE64) ||
      !isValidAesKey(config.EMAIL_ENCRYPTION_KEY_BASE64)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_ENCRYPTION_KEY_BASE64"],
        message: "EMAIL_ENCRYPTION_KEY_BASE64 must decode to a 32-byte key in production",
      });
    }

    if (
      placeholderSecrets.has(config.PAYOUT_ENCRYPTION_KEY_BASE64) ||
      !isValidAesKey(config.PAYOUT_ENCRYPTION_KEY_BASE64)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYOUT_ENCRYPTION_KEY_BASE64"],
        message: "PAYOUT_ENCRYPTION_KEY_BASE64 must decode to a 32-byte key in production",
      });
    }

    if (isMissingOrPlaceholder(config.XAI_API_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["XAI_API_KEY"],
        message:
          "XAI_API_KEY must be configured with a non-placeholder value in production for image generation and xAI fallback routing",
      });
    }

    if (
      config.TEXT_MODEL_PROVIDER === "agentrouter" &&
      isMissingOrPlaceholder(config.AGENT_ROUTER_API_KEY)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["AGENT_ROUTER_API_KEY"],
        message: "AGENT_ROUTER_API_KEY must be configured when TEXT_MODEL_PROVIDER=agentrouter",
      });
    }

    if (
      config.TEXT_MODEL_FALLBACK_PROVIDER === "xai" &&
      isMissingOrPlaceholder(config.XAI_API_KEY)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["TEXT_MODEL_FALLBACK_PROVIDER"],
        message: "TEXT_MODEL_FALLBACK_PROVIDER=xai requires XAI_API_KEY",
      });
    }

    for (const key of ["POSTGRES_PASSWORD", "NEO4J_PASSWORD", "CLICKHOUSE_PASSWORD"] as const) {
      if (isMissingOrPlaceholder(config[key])) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be configured with a non-placeholder value in production`,
        });
      }
    }

    if (config.EMAIL_PROVIDER === "local") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "EMAIL_PROVIDER cannot be local in production",
      });
    }

    if (config.EMAIL_PROVIDER === "sendgrid" && isMissingOrPlaceholder(config.SENDGRID_API_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["SENDGRID_API_KEY"],
        message: "SENDGRID_API_KEY must be configured when EMAIL_PROVIDER=sendgrid",
      });
    }

    if (config.EMAIL_PROVIDER === "sendgrid" && !config.SENDGRID_FROM) {
      ctx.addIssue({
        code: "custom",
        path: ["SENDGRID_FROM"],
        message: "SENDGRID_FROM must use the production Hana sender address",
      });
    }

    if (config.EMAIL_PROVIDER === "smtp" && !config.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST must be configured in production for email authentication",
      });
    }

    if (config.EMAIL_PROVIDER === "smtp" && !config.SMTP_FROM) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_FROM"],
        message: "SMTP_FROM must use the production Hana sender address",
      });
    }

    if (
      config.EMAIL_PROVIDER === "smtp" &&
      config.SMTP_USER &&
      isMissingOrPlaceholder(config.SMTP_PASSWORD)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_PASSWORD"],
        message: "SMTP_PASSWORD must be configured when SMTP_USER is set in production",
      });
    }

    if (config.MONETIZATION_ENABLED && !config.STELLAR_PAYMENTS_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STELLAR_PAYMENTS_ENABLED"],
        message: "Production monetization requires Stellar payments to be enabled",
      });
    }

    if (config.STELLAR_PAYMENTS_ENABLED) {
      for (const key of ["STELLAR_TREASURY_ADDRESS"] as const) {
        if (!config[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} must be configured when Stellar payments are enabled`,
          });
        }
      }
    }

    if (config.STELLAR_NFT_ENABLED) {
      for (const key of ["STELLAR_NFT_CONTRACT_ID", "STELLAR_SERVER_KEY_REF"] as const) {
        if (!config[key] || isMissingOrPlaceholder(config[key])) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} must be configured when Stellar NFT minting is enabled`,
          });
        }
      }
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

function isLikelyStellarIssuer(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value);
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
