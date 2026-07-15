import type { AppConfig } from "@hana/config";
import type { createDatabase, HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import {
  amountCentsToStellarDisplay,
  buildStellarPaymentIntent,
  normalizeStellarAddress,
  normalizeStellarTxHash,
  verifyStellarPayout,
  verifyStellarPayment,
  type StellarPaymentIntent,
  type StellarTransferVerification,
} from "@hana/stellar-bridge";
import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";

type Db = Kysely<HanaDatabase>;

// ---------------------------------------------------------------------------
// Create a Stellar payment intent (stored in billing.crypto_payments)
// ---------------------------------------------------------------------------

export async function createStellarPaymentIntent(input: {
  db: ReturnType<typeof createDatabase>;
  config: AppConfig;
  buyerUserId: string;
  purpose: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, unknown>;
}): Promise<StellarPaymentIntent> {
  assertStellarPaymentsEnabled(input.config);

  if (input.amountCents <= 0) {
    throw new DomainError("VALIDATION_FAILED", "Stellar payment amount must be positive");
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCMinutes(
    expiresAt.getUTCMinutes() + input.config.STELLAR_PAYMENT_INTENT_TTL_MINUTES,
  );

  const amountDisplay = amountCentsToStellarDisplay(
    input.amountCents,
    input.config.STELLAR_PAYMENT_TOKEN_USD_CENTS,
  );
  const providerReference = `${input.purpose}:${randomUUID()}`;
  const memo = randomPaymentMemo();

  const payment = await input.db
    .insertInto("billing.crypto_payments")
    .values({
      buyer_user_id: input.buyerUserId,
      purpose: input.purpose,
      // Store network identifier in chain_id as a numeric sentinel:
      // mainnet = 1, testnet = 2 (Stellar has no EVM-style chain id)
      chain_id: input.config.STELLAR_NETWORK === "mainnet" ? 1 : 2,
      token_address: input.config.STELLAR_PAYMENT_ASSET_ISSUER ?? null,
      amount_atomic: amountDisplay,
      amount_cents: input.amountCents,
      currency: input.currency,
      wallet_address: null,
      provider_reference: providerReference,
      tx_hash: null,
      status: "created",
      expires_at: expiresAt,
      finalized_at: null,
      metadata_json: {
        ...input.metadata,
        network: input.config.STELLAR_NETWORK,
        assetCode: input.config.STELLAR_PAYMENT_ASSET_CODE,
        assetIssuer: input.config.STELLAR_PAYMENT_ASSET_ISSUER ?? null,
        memo,
      },
      updated_at: now,
    })
    .returning([
      "id",
      "chain_id",
      "token_address",
      "amount_atomic",
      "amount_cents",
      "currency",
      "expires_at",
      "provider_reference",
    ])
    .executeTakeFirstOrThrow();

  return buildStellarPaymentIntent({
    id: payment.id,
    network: input.config.STELLAR_NETWORK,
    horizonUrl: input.config.STELLAR_HORIZON_URL,
    treasuryAddress: treasuryAddress(input.config),
    assetCode: input.config.STELLAR_PAYMENT_ASSET_CODE,
    assetIssuer: input.config.STELLAR_PAYMENT_ASSET_ISSUER ?? null,
    amountCents: payment.amount_cents,
    tokenUsdCents: input.config.STELLAR_PAYMENT_TOKEN_USD_CENTS,
    currency: payment.currency,
    expiresAt: payment.expires_at,
    providerReference: String(payment.provider_reference),
    memo,
    requiredConfirmations: input.config.STELLAR_REQUIRED_CONFIRMATIONS,
  });
}

// ---------------------------------------------------------------------------
// Verify a Stellar payment against the ledger and finalize in DB
// ---------------------------------------------------------------------------

export async function verifyStellarPaymentIntent(input: {
  db: ReturnType<typeof createDatabase>;
  config: AppConfig;
  buyerUserId: string;
  paymentId: string;
  txHash: string;
  walletAddress?: string | undefined;
  expectedPurposePrefix: string;
}): Promise<{
  status: "pending" | "finalized";
  paymentId: string;
  purpose: string;
  txHash: string;
  walletAddress: string;
  amountDisplay: string;
  transfer: StellarTransferVerification;
}> {
  assertStellarPaymentsEnabled(input.config);

  const txHash = normalizeStellarTxHash(input.txHash);
  const walletAddress = input.walletAddress
    ? normalizeStellarAddress(input.walletAddress, "walletAddress")
    : undefined;

  const payment = await input.db
    .selectFrom("billing.crypto_payments")
    .selectAll()
    .where("id", "=", input.paymentId)
    .where("buyer_user_id", "=", input.buyerUserId)
    .executeTakeFirst();

  if (!payment) {
    throw new DomainError("RESOURCE_NOT_FOUND", "Stellar payment intent not found");
  }

  if (!payment.purpose.startsWith(input.expectedPurposePrefix)) {
    throw new DomainError("AUTH_FORBIDDEN", "Stellar payment intent does not match this flow");
  }

  if (payment.status === "finalized") {
    if (payment.tx_hash && normalizeStellarTxHash(payment.tx_hash) !== txHash) {
      throw new DomainError(
        "CONFLICT",
        "Stellar payment already finalized with another transaction",
      );
    }

    const paymentAsset = resolveStellarPaymentAsset(payment, input.config);
    const verificationInput: Parameters<typeof verifyStellarPayment>[0] = {
      horizonUrl: input.config.STELLAR_HORIZON_URL,
      network: input.config.STELLAR_NETWORK,
      txHash,
      expectedTo: treasuryAddress(input.config),
      expectedMemo: stellarMemo(payment),
      assetCode: paymentAsset.assetCode,
      assetIssuer: paymentAsset.assetIssuer,
      exactAmountDisplay: String(payment.amount_atomic),
    };
    if (walletAddress) {
      verificationInput.expectedFrom = walletAddress;
    }

    const transfer = await verifyStellarPayment(verificationInput);

    return {
      status: "finalized",
      paymentId: payment.id,
      purpose: payment.purpose,
      txHash,
      walletAddress: payment.wallet_address ?? transfer.fromAddress,
      amountDisplay: String(payment.amount_atomic),
      transfer,
    };
  }

  if (new Date(payment.expires_at).getTime() < Date.now()) {
    await input.db
      .updateTable("billing.crypto_payments")
      .set({ status: "expired", updated_at: new Date() })
      .where("id", "=", payment.id)
      .where("status", "!=", "finalized")
      .execute();
    throw new DomainError("CONFLICT", "Stellar payment intent has expired");
  }

  // Duplicate tx_hash guard
  const duplicate = await input.db
    .selectFrom("billing.crypto_payments")
    .select(["id"])
    .where("chain_id", "=", payment.chain_id)
    .where("tx_hash", "=", txHash)
    .where("id", "!=", payment.id)
    .where("status", "in", ["pending", "finalizing", "finalized"])
    .executeTakeFirst();

  if (duplicate) {
    throw new DomainError("CONFLICT", "This transaction hash is already attached to a payment");
  }

  const paymentAsset = resolveStellarPaymentAsset(payment, input.config);
  const verificationInput: Parameters<typeof verifyStellarPayment>[0] = {
    horizonUrl: input.config.STELLAR_HORIZON_URL,
    network: input.config.STELLAR_NETWORK,
    txHash,
    expectedTo: treasuryAddress(input.config),
    expectedMemo: stellarMemo(payment),
    assetCode: paymentAsset.assetCode,
    assetIssuer: paymentAsset.assetIssuer,
    exactAmountDisplay: String(payment.amount_atomic),
  };
  if (walletAddress) {
    verificationInput.expectedFrom = walletAddress;
  }

  const transfer = await verifyStellarPayment(verificationInput);

  const payerAddress = walletAddress ?? transfer.fromAddress;
  const metadata = {
    ...asRecord(payment.metadata_json),
    txHash,
    payerAddress,
    ledger: transfer.ledger,
  };

  // Stellar transactions are immediately final once on-ledger
  await input.db.transaction().execute(async (tx) => {
    const lockedPayment = await tx
      .selectFrom("billing.crypto_payments")
      .selectAll()
      .where("id", "=", payment.id)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (lockedPayment.status !== "finalized") {
      const lockedDuplicate = await tx
        .selectFrom("billing.crypto_payments")
        .select(["id"])
        .where("chain_id", "=", payment.chain_id)
        .where("tx_hash", "=", txHash)
        .where("id", "!=", payment.id)
        .where("status", "in", ["pending", "finalizing", "finalized"])
        .executeTakeFirst();

      if (lockedDuplicate) {
        throw new DomainError("CONFLICT", "This transaction hash is already attached to a payment");
      }

      await tx
        .updateTable("billing.crypto_payments")
        .set({
          status: "finalized",
          tx_hash: txHash,
          wallet_address: payerAddress,
          finalized_at: new Date(),
          metadata_json: metadata,
          updated_at: new Date(),
        })
        .where("id", "=", payment.id)
        .execute();
    }

    await upsertStellarTransaction(tx, {
      transfer,
      providerReference: String(payment.provider_reference),
      direction: "inbound",
      status: "confirmed",
      metadata,
    });
  });

  return {
    status: "finalized",
    paymentId: payment.id,
    purpose: payment.purpose,
    txHash,
    walletAddress: payerAddress,
    amountDisplay: String(payment.amount_atomic),
    transfer,
  };
}

// ---------------------------------------------------------------------------
// Verify an outbound Stellar payout from treasury to creator wallet.
// ---------------------------------------------------------------------------

export async function verifyStellarPayoutTransfer(input: {
  db: ReturnType<typeof createDatabase>;
  config: AppConfig;
  payoutId: string;
  txHash: string;
  creatorWalletAddress: string;
  amountCents: number;
  metadata: Record<string, unknown>;
}): Promise<StellarTransferVerification & { amountDisplay: string }> {
  assertStellarPaymentsEnabled(input.config);

  const amountDisplay = amountCentsToStellarDisplay(
    input.amountCents,
    input.config.STELLAR_PAYMENT_TOKEN_USD_CENTS,
  );
  const transfer = await verifyStellarPayout({
    horizonUrl: input.config.STELLAR_HORIZON_URL,
    network: input.config.STELLAR_NETWORK,
    txHash: input.txHash,
    expectedFrom: treasuryAddress(input.config),
    expectedTo: normalizeStellarAddress(input.creatorWalletAddress, "creatorWalletAddress"),
    assetCode: input.config.STELLAR_PAYMENT_ASSET_CODE,
    assetIssuer: input.config.STELLAR_PAYMENT_ASSET_ISSUER ?? null,
    exactAmountDisplay: amountDisplay,
  });

  const metadata = {
    ...input.metadata,
    amountDisplay,
    creatorWalletAddress: input.creatorWalletAddress,
  };

  await upsertStellarTransaction(input.db, {
    transfer,
    providerReference: `creator-payout:${input.payoutId}`,
    direction: "outbound",
    status: "confirmed",
    metadata,
  });

  return { ...transfer, amountDisplay };
}

// ---------------------------------------------------------------------------
// Build a StellarPaymentIntent from a stored payment row
// ---------------------------------------------------------------------------

export function toStellarPaymentIntent(
  payment: {
    id: string;
    chain_id: number;
    token_address: string | null;
    amount_atomic: string;
    amount_cents: number;
    currency: string;
    expires_at: Date;
    provider_reference: string;
    metadata_json?: unknown;
  },
  config: AppConfig,
): StellarPaymentIntent {
  const memo = stellarMemo(payment);
  const paymentAsset = resolveStellarPaymentAsset(payment, config);

  return buildStellarPaymentIntent({
    id: payment.id,
    network: config.STELLAR_NETWORK,
    horizonUrl: config.STELLAR_HORIZON_URL,
    treasuryAddress: treasuryAddress(config),
    assetCode: paymentAsset.assetCode,
    assetIssuer: paymentAsset.assetIssuer,
    amountCents: payment.amount_cents,
    tokenUsdCents: config.STELLAR_PAYMENT_TOKEN_USD_CENTS,
    currency: payment.currency,
    expiresAt: payment.expires_at,
    providerReference: payment.provider_reference,
    memo,
    requiredConfirmations: config.STELLAR_REQUIRED_CONFIRMATIONS,
  });
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function assertStellarPaymentsEnabled(config: AppConfig): void {
  if (!config.MONETIZATION_ENABLED || !config.STELLAR_PAYMENTS_ENABLED) {
    throw new DomainError("ENTITLEMENT_REQUIRED", "Stellar payments are not enabled.");
  }

  treasuryAddress(config);
}

function treasuryAddress(config: AppConfig): string {
  if (!config.STELLAR_TREASURY_ADDRESS) {
    throw new DomainError("INTERNAL", "Stellar treasury address is not configured");
  }

  return normalizeStellarAddress(config.STELLAR_TREASURY_ADDRESS, "STELLAR_TREASURY_ADDRESS");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertStellarTransaction(
  db: Db,
  input: {
    transfer: StellarTransferVerification;
    providerReference: string;
    direction: "inbound" | "outbound";
    status: "confirming" | "confirmed";
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto("web3.chain_transactions")
    .values({
      chain_id: input.transfer.network === "mainnet" ? 1 : 2,
      tx_hash: input.transfer.txHash,
      provider_reference: input.providerReference,
      direction: input.direction,
      status: input.status,
      block_number: String(input.transfer.ledger),
      confirmation_count: 1,
      raw_payload_hash: null,
      metadata_json: input.metadata,
      confirmed_at: input.status === "confirmed" ? new Date() : null,
      updated_at: new Date(),
    })
    .onConflict((oc) =>
      oc.columns(["chain_id", "tx_hash"]).doUpdateSet({
        provider_reference: input.providerReference,
        direction: input.direction,
        status: input.status,
        block_number: String(input.transfer.ledger),
        confirmation_count: 1,
        metadata_json: input.metadata,
        confirmed_at: input.status === "confirmed" ? new Date() : null,
        updated_at: new Date(),
      }),
    )
    .execute();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function resolveStellarPaymentAsset(
  payment: {
    metadata_json?: unknown;
    token_address: string | null;
  },
  config: Pick<AppConfig, "STELLAR_PAYMENT_ASSET_CODE" | "STELLAR_PAYMENT_ASSET_ISSUER">,
): { assetCode: string; assetIssuer: string | null } {
  const metadata = asRecord(payment.metadata_json);
  const metadataAssetCode = optionalString(metadata["assetCode"]);
  const metadataAssetIssuer = optionalString(metadata["assetIssuer"]);
  const assetCode = (metadataAssetCode ?? config.STELLAR_PAYMENT_ASSET_CODE).trim().toUpperCase();

  if (assetCode === "XLM") {
    return { assetCode, assetIssuer: null };
  }

  const assetIssuer =
    metadataAssetIssuer ??
    optionalString(payment.token_address) ??
    optionalString(config.STELLAR_PAYMENT_ASSET_ISSUER);

  if (!assetIssuer) {
    throw new DomainError("INTERNAL", `Stellar payment intent is missing issuer for ${assetCode}`);
  }

  return { assetCode, assetIssuer };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stellarMemo(payment: {
  metadata_json?: unknown;
  provider_reference: string | null;
}): string {
  const metadata = asRecord(payment.metadata_json);
  const memo = metadata["memo"];

  if (typeof memo === "string" && memo.length > 0) {
    return memo;
  }

  return String(payment.provider_reference ?? "").slice(0, 28);
}

function randomPaymentMemo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 28);
}
