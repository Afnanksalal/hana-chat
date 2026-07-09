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
