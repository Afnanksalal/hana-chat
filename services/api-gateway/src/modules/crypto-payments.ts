import type { AppConfig } from "@hana/config";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { formatUnits, getAddress, JsonRpcProvider } from "ethers";
import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";

type Db = Kysely<HanaDatabase>;

export interface CryptoPaymentIntent {
  id: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  treasuryAddress: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  tokenDecimals: number;
  amountAtomic: string;
  amountHex: string;
  amountDisplay: string;
  amountCents: number;
  currency: string;
  expiresAt: string;
  providerReference: string;
  requiredConfirmations: number;
}

export interface NativeTransferVerification {
  status: "pending" | "finalized";
  txHash: string;
  fromAddress: string;
  toAddress: string;
  valueAtomic: string;
  blockNumber: string;
  confirmationCount: number;
  requiredConfirmations: number;
  chainId: number;
}

export interface CryptoPaymentVerification {
  status: "pending" | "finalized";
  paymentId: string;
  purpose: string;
  txHash: string;
  walletAddress: string;
  amountAtomic: string;
  confirmationCount: number;
  requiredConfirmations: number;
  transfer: NativeTransferVerification;
}

export async function createCryptoPaymentIntent(input: {
  db: ReturnType<typeof createDatabase>;
  config: AppConfig;
  buyerUserId: string;
  purpose: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, unknown>;
}): Promise<CryptoPaymentIntent> {
  assertCryptoPaymentsEnabled(input.config);

  if (input.amountCents <= 0) {
    throw new DomainError("VALIDATION_FAILED", "Crypto payment amount must be positive");
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + input.config.OG_PAYMENT_INTENT_TTL_MINUTES);

  const amountAtomic = amountCentsToNativeAtomic(input.amountCents, input.config);
  const payment = await input.db
    .insertInto("billing.crypto_payments")
    .values({
      buyer_user_id: input.buyerUserId,
      purpose: input.purpose,
      chain_id: input.config.OG_CHAIN_ID,
      token_address: null,
      amount_atomic: amountAtomic.toString(),
      amount_cents: input.amountCents,
      currency: input.currency,
      wallet_address: null,
      provider_reference: `${input.purpose}:${randomUUID()}`,
      tx_hash: null,
      status: "created",
      expires_at: expiresAt,
      finalized_at: null,
      metadata_json: input.metadata,
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

  return toCryptoPaymentIntent(payment, input.config);
}

export async function verifyCryptoPaymentIntent(input: {
  db: ReturnType<typeof createDatabase>;
  config: AppConfig;
  buyerUserId: string;
  paymentId: string;
  txHash: string;
  walletAddress?: string | undefined;
  expectedPurposePrefix: string;
}): Promise<CryptoPaymentVerification> {
  assertCryptoPaymentsEnabled(input.config);

  const txHash = normalizeTxHash(input.txHash);
  const walletAddress = input.walletAddress
    ? normalizeAddress(input.walletAddress, "walletAddress")
    : undefined;
  const payment = await input.db
    .selectFrom("billing.crypto_payments")
    .selectAll()
    .where("id", "=", input.paymentId)
    .where("buyer_user_id", "=", input.buyerUserId)
    .executeTakeFirst();

  if (!payment) {
    throw new DomainError("RESOURCE_NOT_FOUND", "Crypto payment intent not found");
  }

  if (!payment.purpose.startsWith(input.expectedPurposePrefix)) {
    throw new DomainError("AUTH_FORBIDDEN", "Crypto payment intent does not match this flow");
  }

  if (payment.chain_id !== input.config.OG_CHAIN_ID) {
    throw new DomainError("CONFLICT", "Crypto payment intent was created for another chain");
  }

  if (payment.status === "finalized") {
    if (payment.tx_hash && normalizeTxHash(payment.tx_hash) !== txHash) {
      throw new DomainError(
        "CONFLICT",
        "Crypto payment already finalized with another transaction",
      );
    }

    const transfer = await verifyNativeTransfer({
      config: input.config,
      txHash,
      expectedTo: treasuryAddress(input.config),
      expectedFrom: walletAddress,
      minimumAmountAtomic: BigInt(String(payment.amount_atomic)),
    });

    return {
      status: "finalized",
      paymentId: payment.id,
      purpose: payment.purpose,
      txHash,
      walletAddress: payment.wallet_address ?? transfer.fromAddress,
      amountAtomic: String(payment.amount_atomic),
      confirmationCount: transfer.confirmationCount,
      requiredConfirmations: transfer.requiredConfirmations,
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
    throw new DomainError("CONFLICT", "Crypto payment intent has expired");
  }

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

  const transfer = await verifyNativeTransfer({
    config: input.config,
    txHash,
    expectedTo: treasuryAddress(input.config),
    expectedFrom: walletAddress,
    minimumAmountAtomic: BigInt(String(payment.amount_atomic)),
  });
  const payerAddress = walletAddress ?? transfer.fromAddress;
  const metadata = {
    ...asRecord(payment.metadata_json),
    txHash,
    payerAddress,
    confirmationCount: transfer.confirmationCount,
    requiredConfirmations: transfer.requiredConfirmations,
  };

  if (transfer.status === "pending") {
    await input.db
      .updateTable("billing.crypto_payments")
      .set({
        status: "pending",
        tx_hash: txHash,
        wallet_address: payerAddress,
        metadata_json: metadata,
        updated_at: new Date(),
      })
      .where("id", "=", payment.id)
      .where("status", "!=", "finalized")
      .execute();
    await upsertChainTransaction(input.db, {
      transfer,
      providerReference: payment.provider_reference,
      direction: "inbound",
      status: "confirming",
      metadata,
    });

    return {
      status: "pending",
      paymentId: payment.id,
      purpose: payment.purpose,
      txHash,
      walletAddress: payerAddress,
      amountAtomic: String(payment.amount_atomic),
      confirmationCount: transfer.confirmationCount,
      requiredConfirmations: transfer.requiredConfirmations,
      transfer,
    };
  }

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

    await upsertChainTransaction(tx, {
      transfer,
      providerReference: payment.provider_reference,
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
    amountAtomic: String(payment.amount_atomic),
    confirmationCount: transfer.confirmationCount,
    requiredConfirmations: transfer.requiredConfirmations,
    transfer,
  };
}

export async function verifyCryptoPayoutTransfer(input: {
  db: ReturnType<typeof createDatabase>;
  config: AppConfig;
  payoutId: string;
  txHash: string;
  creatorWalletAddress: string;
  amountCents: number;
  metadata: Record<string, unknown>;
}): Promise<NativeTransferVerification & { amountAtomic: string }> {
  assertCryptoPaymentsEnabled(input.config);

  const amountAtomic = amountCentsToNativeAtomic(input.amountCents, input.config);
  const transfer = await verifyNativeTransfer({
    config: input.config,
    txHash: input.txHash,
    expectedFrom: treasuryAddress(input.config),
    expectedTo: input.creatorWalletAddress,
    minimumAmountAtomic: amountAtomic,
  });
  const metadata = {
    ...input.metadata,
    amountAtomic: amountAtomic.toString(),
    creatorWalletAddress: normalizeAddress(input.creatorWalletAddress, "creatorWalletAddress"),
  };

  await upsertChainTransaction(input.db, {
    transfer,
    providerReference: `creator-payout:${input.payoutId}`,
    direction: "outbound",
    status: transfer.status === "finalized" ? "confirmed" : "confirming",
    metadata,
  });

  return { ...transfer, amountAtomic: amountAtomic.toString() };
}

export function toCryptoPaymentIntent(
  payment: {
    id: string;
    chain_id: number;
    token_address: string | null;
    amount_atomic: string;
    amount_cents: number;
    currency: string;
    expires_at: Date;
    provider_reference: string;
  },
  config: AppConfig,
): CryptoPaymentIntent {
  const amountAtomic = BigInt(String(payment.amount_atomic));

  return {
    id: payment.id,
    chainId: payment.chain_id,
    chainName: ogChainName(config),
    rpcUrl: config.OG_RPC_URL,
    treasuryAddress: treasuryAddress(config),
    tokenAddress: payment.token_address,
    tokenSymbol: config.OG_PAYMENT_TOKEN_SYMBOL,
    tokenDecimals: config.OG_PAYMENT_TOKEN_DECIMALS,
    amountAtomic: amountAtomic.toString(),
    amountHex: `0x${amountAtomic.toString(16)}`,
    amountDisplay: formatUnits(amountAtomic, config.OG_PAYMENT_TOKEN_DECIMALS),
    amountCents: payment.amount_cents,
    currency: payment.currency,
    expiresAt: payment.expires_at.toISOString(),
    providerReference: payment.provider_reference,
    requiredConfirmations: config.OG_CONFIRMATION_BLOCKS,
  };
}

export function normalizeAddress(value: string, fieldName = "address"): string {
  try {
    return getAddress(value);
  } catch {
    throw new DomainError("VALIDATION_FAILED", `Invalid ${fieldName}`);
  }
}

export function amountCentsToNativeAtomic(amountCents: number, config: AppConfig): bigint {
  const decimalsMultiplier = 10n ** BigInt(config.OG_PAYMENT_TOKEN_DECIMALS);
  const numerator = BigInt(amountCents) * decimalsMultiplier;
  const denominator = BigInt(config.OG_PAYMENT_TOKEN_USD_CENTS);

  return (numerator + denominator - 1n) / denominator;
}

export function assertCryptoPaymentsEnabled(config: AppConfig): void {
  if (!config.MONETIZATION_ENABLED || !config.OG_PAYMENTS_ENABLED) {
    throw new DomainError("ENTITLEMENT_REQUIRED", "Crypto payments are not enabled.");
  }

  treasuryAddress(config);
}

function treasuryAddress(config: AppConfig): string {
  if (!config.OG_TREASURY_WALLET_ADDRESS) {
    throw new DomainError("INTERNAL", "0G treasury wallet is not configured");
  }

  return normalizeAddress(config.OG_TREASURY_WALLET_ADDRESS, "OG_TREASURY_WALLET_ADDRESS");
}

async function verifyNativeTransfer(input: {
  config: AppConfig;
  txHash: string;
  expectedTo: string;
  expectedFrom?: string | undefined;
  minimumAmountAtomic: bigint;
}): Promise<NativeTransferVerification> {
  const txHash = normalizeTxHash(input.txHash);
  const expectedTo = normalizeAddress(input.expectedTo, "expected recipient");
  const expectedFrom = input.expectedFrom
    ? normalizeAddress(input.expectedFrom, "expected sender")
    : undefined;
  const provider = new JsonRpcProvider(input.config.OG_RPC_URL, input.config.OG_CHAIN_ID);
  const [transaction, receipt, latestBlockNumber] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash),
    provider.getBlockNumber(),
  ]);

  if (!transaction || !receipt) {
    throw new DomainError("CONFLICT", "0G transaction is not available yet", { txHash });
  }

  if (Number(transaction.chainId) !== input.config.OG_CHAIN_ID) {
    throw new DomainError("AUTH_FORBIDDEN", "0G transaction chain does not match Hana payments");
  }

  if (receipt.status !== 1) {
    throw new DomainError("AUTH_FORBIDDEN", "0G transaction failed on-chain");
  }

  if (!transaction.to || normalizeAddress(transaction.to, "transaction recipient") !== expectedTo) {
    throw new DomainError("AUTH_FORBIDDEN", "0G transaction recipient does not match");
  }

  const fromAddress = normalizeAddress(transaction.from, "transaction sender");

  if (expectedFrom && fromAddress !== expectedFrom) {
    throw new DomainError("AUTH_FORBIDDEN", "0G transaction sender does not match the wallet");
  }

  if (transaction.value < input.minimumAmountAtomic) {
    throw new DomainError("AUTH_FORBIDDEN", "0G transaction amount is below the payment amount");
  }

  const confirmationCount = Math.max(0, latestBlockNumber - receipt.blockNumber + 1);
  const status = confirmationCount >= input.config.OG_CONFIRMATION_BLOCKS ? "finalized" : "pending";

  return {
    status,
    txHash,
    fromAddress,
    toAddress: expectedTo,
    valueAtomic: transaction.value.toString(),
    blockNumber: String(receipt.blockNumber),
    confirmationCount,
    requiredConfirmations: input.config.OG_CONFIRMATION_BLOCKS,
    chainId: input.config.OG_CHAIN_ID,
  };
}

async function upsertChainTransaction(
  db: Db,
  input: {
    transfer: NativeTransferVerification;
    providerReference: string;
    direction: "inbound" | "outbound";
    status: "confirming" | "confirmed";
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto("web3.chain_transactions")
    .values({
      chain_id: input.transfer.chainId,
      tx_hash: input.transfer.txHash,
      provider_reference: input.providerReference,
      direction: input.direction,
      status: input.status,
      block_number: input.transfer.blockNumber,
      confirmation_count: input.transfer.confirmationCount,
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
        block_number: input.transfer.blockNumber,
        confirmation_count: input.transfer.confirmationCount,
        metadata_json: input.metadata,
        confirmed_at: input.status === "confirmed" ? new Date() : null,
        updated_at: new Date(),
      }),
    )
    .execute();
}

function normalizeTxHash(value: string): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new DomainError("VALIDATION_FAILED", "Invalid transaction hash");
  }

  return value.toLowerCase();
}

function ogChainName(config: AppConfig): string {
  if (config.OG_NETWORK === "testnet") {
    return "0G Galileo Testnet";
  }

  if (config.OG_NETWORK === "local") {
    return "0G Local";
  }

  return "0G";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
