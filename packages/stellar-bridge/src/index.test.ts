import { describe, expect, it } from "vitest";

import { isMatchingStellarPaymentAsset } from "./index";

describe("isMatchingStellarPaymentAsset", () => {
  it("matches native XLM without requiring an issuer", () => {
    expect(isMatchingStellarPaymentAsset({ asset_type: "native" }, "XLM", undefined)).toBe(true);
    expect(isMatchingStellarPaymentAsset({ asset_type: "native" }, "xlm", null)).toBe(true);
  });

  it("does not match issued assets as native XLM", () => {
    expect(
      isMatchingStellarPaymentAsset(
        { asset_type: "credit_alphanum4", asset_code: "XLM", asset_issuer: "GISSUER" },
        "XLM",
        null,
      ),
    ).toBe(false);
  });

  it("requires issuer equality for non-native assets", () => {
    expect(
      isMatchingStellarPaymentAsset(
        { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER" },
        "USDC",
        "GISSUER",
      ),
    ).toBe(true);
    expect(
      isMatchingStellarPaymentAsset(
        { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER" },
        "USDC",
        "GOTHER",
      ),
    ).toBe(false);
  });
});
