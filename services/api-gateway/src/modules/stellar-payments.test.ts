import { describe, expect, it } from "vitest";

import { resolveStellarPaymentAsset } from "./stellar-payments";

describe("resolveStellarPaymentAsset", () => {
  const issuer = `G${"A".repeat(55)}`;
  const config = {
    STELLAR_PAYMENT_ASSET_CODE: "XLM",
    STELLAR_PAYMENT_ASSET_ISSUER: undefined,
  };

  it("uses the asset stored on the payment intent instead of current config", () => {
    const asset = resolveStellarPaymentAsset(
      {
        metadata_json: { assetCode: "USDC", assetIssuer: issuer },
        token_address: null,
      },
      config,
    );

    expect(asset).toEqual({ assetCode: "USDC", assetIssuer: issuer });
  });

  it("normalizes native XLM and ignores stale issuer fields", () => {
    const asset = resolveStellarPaymentAsset(
      {
        metadata_json: { assetCode: "xlm", assetIssuer: issuer },
        token_address: issuer,
      },
      {
        STELLAR_PAYMENT_ASSET_CODE: "USDC",
        STELLAR_PAYMENT_ASSET_ISSUER: issuer,
      },
    );

    expect(asset).toEqual({ assetCode: "XLM", assetIssuer: null });
  });

  it("falls back to token_address for legacy non-native payment rows", () => {
    const asset = resolveStellarPaymentAsset(
      {
        metadata_json: null,
        token_address: issuer,
      },
      {
        STELLAR_PAYMENT_ASSET_CODE: "USDC",
        STELLAR_PAYMENT_ASSET_ISSUER: undefined,
      },
    );

    expect(asset).toEqual({ assetCode: "USDC", assetIssuer: issuer });
  });

  it("fails closed when a non-native payment intent has no issuer", () => {
    expect(() =>
      resolveStellarPaymentAsset(
        {
          metadata_json: { assetCode: "USDC" },
          token_address: null,
        },
        {
          STELLAR_PAYMENT_ASSET_CODE: "USDC",
          STELLAR_PAYMENT_ASSET_ISSUER: undefined,
        },
      ),
    ).toThrow("missing issuer");
  });
});
