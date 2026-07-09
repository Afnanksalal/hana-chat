import { describe, expect, it } from "vitest";

import { AppConfigSchema } from "./index";

describe("AppConfigSchema Stellar payment asset config", () => {
  const issuer = `G${"A".repeat(55)}`;

  it("normalizes native XLM and treats an empty issuer as absent", () => {
    const config = AppConfigSchema.parse({
      STELLAR_PAYMENT_ASSET_CODE: "xlm",
      STELLAR_PAYMENT_ASSET_ISSUER: "",
    });

    expect(config.STELLAR_PAYMENT_ASSET_CODE).toBe("XLM");
    expect(config.STELLAR_PAYMENT_ASSET_ISSUER).toBeUndefined();
  });

  it("rejects an issuer for native XLM", () => {
    const result = AppConfigSchema.safeParse({
      STELLAR_PAYMENT_ASSET_CODE: "XLM",
      STELLAR_PAYMENT_ASSET_ISSUER: issuer,
    });

    expect(result.success).toBe(false);
  });

  it("requires an issuer for non-native payment assets", () => {
    const result = AppConfigSchema.safeParse({
      STELLAR_PAYMENT_ASSET_CODE: "USDC",
      STELLAR_PAYMENT_ASSET_ISSUER: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts issued assets with a Stellar issuer public key", () => {
    const config = AppConfigSchema.parse({
      STELLAR_PAYMENT_ASSET_CODE: "usdc",
      STELLAR_PAYMENT_ASSET_ISSUER: issuer,
    });

    expect(config.STELLAR_PAYMENT_ASSET_CODE).toBe("USDC");
    expect(config.STELLAR_PAYMENT_ASSET_ISSUER).toBe(issuer);
  });
});

describe("AppConfigSchema text model provider config", () => {
  const productionBase = {
    NODE_ENV: "production",
    POSTGRES_PASSWORD: "prod-postgres-password",
    NEO4J_PASSWORD: "prod-neo4j-password",
    CLICKHOUSE_PASSWORD: "prod-clickhouse-password",
    EMAIL_HASH_SECRET: "email-hash-secret-with-enough-length",
    EMAIL_ENCRYPTION_KEY_BASE64: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=",
    PAYOUT_ENCRYPTION_KEY_BASE64: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=",
    SESSION_SECRET: "session-secret-with-enough-length",
    XAI_API_KEY: "test-xai-key",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "smtp-relay",
    WEB_ORIGIN: "https://app.hanachat.site",
    WEB_ORIGINS: "https://app.hanachat.site,https://hanachat.site",
    API_GATEWAY_URL: "https://api.hanachat.site",
  };

  it("accepts Groq as the primary text provider when a key is configured", () => {
    const config = AppConfigSchema.parse({
      TEXT_MODEL_PROVIDER: "groq",
      GROQ_API_KEY: "test-groq-key",
    });

    expect(config.TEXT_MODEL_PROVIDER).toBe("groq");
    expect(config.GROQ_BASE_URL).toBe("https://api.groq.com/openai/v1");
    expect(config.GROQ_DEFAULT_MODEL).toBe("llama-3.1-8b-instant");
  });

  it("rejects Groq as the primary text provider without a key", () => {
    const result = AppConfigSchema.safeParse({
      ...productionBase,
      TEXT_MODEL_PROVIDER: "groq",
    });

    expect(result.success).toBe(false);
  });

  it("accepts Groq as an explicit fallback provider when a key is configured", () => {
    const config = AppConfigSchema.parse({
      TEXT_MODEL_PROVIDER: "agentrouter",
      AGENT_ROUTER_API_KEY: "test-agent-router-key",
      TEXT_MODEL_FALLBACK_PROVIDER: "groq",
      GROQ_API_KEY: "test-groq-key",
    });

    expect(config.TEXT_MODEL_FALLBACK_PROVIDER).toBe("groq");
  });
});
