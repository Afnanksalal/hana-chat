import { describe, expect, it } from "vitest";

import { isExactStellarAmount, isMatchingStellarPaymentAsset } from "./index";

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

describe("isExactStellarAmount", () => {
  it("matches equal Stellar amounts at stroop precision", () => {
    expect(isExactStellarAmount("5.0000000", "5")).toBe(true);
    expect(isExactStellarAmount("0.1000000", "0.1")).toBe(true);
    expect(isExactStellarAmount("1.0000001", "1.0000001")).toBe(true);
  });

  it("rejects overpayment, underpayment, and invalid decimals", () => {
    expect(isExactStellarAmount("5.0000001", "5.0000000")).toBe(false);
    expect(isExactStellarAmount("4.9999999", "5.0000000")).toBe(false);
    expect(isExactStellarAmount("5.00000001", "5.0000000")).toBe(false);
  });
});
