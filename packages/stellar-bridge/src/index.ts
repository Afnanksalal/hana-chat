import { Horizon, StrKey } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Snapshot types used for Stellar memory commitments.
// ---------------------------------------------------------------------------

export type StellarSnapshotKind = "conversation_memory" | "creator_soul_pack" | "user_export";

export interface StellarMemorySnapshotFact {
  id: string;
  kind: string;
  importance: number;
  emotionalWeight: number;
  updatedAt: string;
  text: string;
  sourceMessageIds: string[];
}

export interface StellarMemorySnapshotManifestInput {
  snapshotKind: StellarSnapshotKind;
  network: string;
  userId: string;
  characterId: string | null;
  conversationId: string | null;
  facts: StellarMemorySnapshotFact[];
  createdAt?: string;
}

export interface StellarMemorySnapshotManifest {
  schemaVersion: 1;
  snapshotKind: StellarSnapshotKind;
  network: string;
  userId: string;
  characterId: string | null;
  conversationId: string | null;
  createdAt: string;
  factCount: number;
  sourceMemoryIds: string[];
  factCommitments: Array<{
    memoryId: string;
    kind: string;
    importance: number;
    emotionalWeight: number;
    updatedAt: string;
    textHash: string;
    sourceMessageIds: string[];
  }>;
}

export interface StellarMemorySnapshotCommitment {
  manifest: StellarMemorySnapshotManifest;
  manifestHash: string;
  rootHash: string;
  sourceMemoryIds: string[];
}

// ---------------------------------------------------------------------------
// Payment types
// ---------------------------------------------------------------------------

export interface StellarPaymentIntent {
  id: string;
  network: "mainnet" | "testnet";
  horizonUrl: string;
  treasuryAddress: string;
  assetCode: string;
  assetIssuer: string | null; // null means native XLM
  amountDisplay: string;
  amountCents: number;
  currency: string;
  expiresAt: string;
  providerReference: string;
  memo: string;
  requiredConfirmations: number;
}

export interface StellarTransferVerification {
  status: "pending" | "finalized";
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amountDisplay: string;
  ledger: number;
  network: string;
}

// ---------------------------------------------------------------------------
// Manifest commitment (pure, no network I/O)
// ---------------------------------------------------------------------------

export function buildMemorySnapshotCommitment(
  input: StellarMemorySnapshotManifestInput,
): StellarMemorySnapshotCommitment {
  const sourceMemoryIds = input.facts.map((fact) => fact.id);
  const manifest: StellarMemorySnapshotManifest = {
    schemaVersion: 1,
    snapshotKind: input.snapshotKind,
    network: input.network,
    userId: input.userId,
    characterId: input.characterId,
    conversationId: input.conversationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    factCount: input.facts.length,
    sourceMemoryIds,
    factCommitments: input.facts.map((fact) => ({
      memoryId: fact.id,
      kind: fact.kind,
      importance: fact.importance,
      emotionalWeight: fact.emotionalWeight,
      updatedAt: fact.updatedAt,
      textHash: sha256Hex(fact.text),
      sourceMessageIds: fact.sourceMessageIds,
    })),
  };
  const manifestHash = sha256Hex(stableStringify(manifest));
  const rootHash = sha256Hex(
    `hana-stellar-snapshot-v1:${manifestHash}:${sourceMemoryIds.join(",")}`,
  );

  return { manifest, manifestHash, rootHash, sourceMemoryIds };
}

// ---------------------------------------------------------------------------
// Address / transaction helpers
// ---------------------------------------------------------------------------

export function normalizeStellarAddress(value: string, fieldName = "address"): string {
  const trimmed = value.trim();

  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    throw new Error(`Invalid Stellar ${fieldName}: ${trimmed}`);
  }

  return trimmed;
}

export function normalizeStellarTxHash(value: string): string {
  const trimmed = value.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(trimmed)) {
    throw new Error(`Invalid Stellar transaction hash: ${value}`);
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Payment intent creation (amount to display string)
// ---------------------------------------------------------------------------

export function buildStellarPaymentIntent(input: {
  id: string;
  network: "mainnet" | "testnet";
  horizonUrl: string;
  treasuryAddress: string;
  assetCode: string;
  assetIssuer: string | null;
  amountCents: number;
  tokenUsdCents: number;
  currency: string;
  expiresAt: Date;
  providerReference: string;
  memo: string;
  requiredConfirmations?: number;
}): StellarPaymentIntent {
  const amountDisplay = buildAmountDisplay(input.amountCents, input.tokenUsdCents);

  return {
    id: input.id,
    network: input.network,
    horizonUrl: input.horizonUrl,
    treasuryAddress: input.treasuryAddress,
    assetCode: input.assetCode,
    assetIssuer: input.assetIssuer,
    amountDisplay,
    amountCents: input.amountCents,
    currency: input.currency,
    expiresAt: input.expiresAt.toISOString(),
    providerReference: input.providerReference,
    memo: input.memo,
    requiredConfirmations: input.requiredConfirmations ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Payment verification verifies a Stellar payment transaction on Horizon.
// ---------------------------------------------------------------------------

export async function verifyStellarPayment(input: {
  horizonUrl: string;
  network: "mainnet" | "testnet";
  txHash: string;
  expectedTo: string;
  expectedFrom?: string;
  expectedMemo?: string;
  assetCode: string;
  assetIssuer: string | null;
  minimumAmountDisplay: string;
}): Promise<StellarTransferVerification> {
  const server = new Horizon.Server(input.horizonUrl, { allowHttp: false });
  const txHash = normalizeStellarTxHash(input.txHash);
  const expectedTo = normalizeStellarAddress(input.expectedTo, "treasury");
  const expectedFrom = input.expectedFrom
    ? normalizeStellarAddress(input.expectedFrom, "sender")
    : undefined;

  // Load the transaction
  let tx: Horizon.ServerApi.TransactionRecord;

  try {
    tx = await server.transactions().transaction(txHash).call();
  } catch {
    throw new Error(`Stellar transaction not found on ${input.network}: ${txHash}`);
  }

  if (!tx.successful) {
    throw new Error("Stellar transaction did not succeed on-ledger");
  }

  if (input.expectedMemo) {
    if (tx.memo_type !== "text" || tx.memo !== input.expectedMemo) {
      throw new Error("Stellar transaction memo does not match the payment intent");
    }
  }

  // Load payment operations for this transaction
  const ops = await server.operations().forTransaction(txHash).call();
  const paymentOp = ops.records.find(
    (op): op is Horizon.ServerApi.PaymentOperationRecord =>
      isPaymentOperationRecord(op) &&
      op.to === expectedTo &&
      isMatchingAsset(op, input.assetCode, input.assetIssuer),
  );

  if (!paymentOp) {
    throw new Error(
      `No payment to treasury (${expectedTo}) with asset ${input.assetCode} found in transaction`,
    );
  }

  const fromAddress = paymentOp.from;

  if (expectedFrom && fromAddress !== expectedFrom) {
    throw new Error("Stellar transaction sender does not match the expected wallet");
  }

  if (!isSufficientAmount(paymentOp.amount, input.minimumAmountDisplay)) {
    throw new Error(
      `Stellar payment amount ${paymentOp.amount} is below required ${input.minimumAmountDisplay}`,
    );
  }

  return {
    status: "finalized",
    txHash,
    fromAddress,
    toAddress: expectedTo,
    amountDisplay: paymentOp.amount,
    ledger: tx.ledger_attr,
    network: input.network,
  };
}

// ---------------------------------------------------------------------------
// NFT token IDs are deterministic so future Soroban minting can be retried safely.
// ---------------------------------------------------------------------------

export function deriveMemoryNftTokenId(input: {
  snapshotKind: StellarSnapshotKind;
  manifestRootHash: string;
}): string {
  return `hana-nft:${input.snapshotKind}:${sha256Hex(input.manifestRootHash).slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Payout verification verifies an outbound Stellar payment from treasury.
// ---------------------------------------------------------------------------

export async function verifyStellarPayout(input: {
  horizonUrl: string;
  network: "mainnet" | "testnet";
  txHash: string;
  expectedFrom: string;
  expectedTo: string;
  expectedMemo?: string;
  assetCode: string;
  assetIssuer: string | null;
  minimumAmountDisplay: string;
}): Promise<StellarTransferVerification> {
  const verificationInput: Parameters<typeof verifyStellarPayment>[0] = {
    horizonUrl: input.horizonUrl,
    network: input.network,
    txHash: input.txHash,
    expectedTo: input.expectedTo,
    expectedFrom: input.expectedFrom,
    assetCode: input.assetCode,
    assetIssuer: input.assetIssuer,
    minimumAmountDisplay: input.minimumAmountDisplay,
  };

  if (input.expectedMemo) {
    verificationInput.expectedMemo = input.expectedMemo;
  }

  return verifyStellarPayment(verificationInput);
}

// ---------------------------------------------------------------------------
// Amount helpers
// ---------------------------------------------------------------------------

export function amountCentsToStellarDisplay(amountCents: number, tokenUsdCents: number): string {
  return buildAmountDisplay(amountCents, tokenUsdCents);
}

function buildAmountDisplay(amountCents: number, tokenUsdCents: number): string {
  // Stellar amounts are 7 decimal places (1 stroop = 0.0000001)
  const value = amountCents / tokenUsdCents;
  return value.toFixed(7);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

function isPaymentOperationRecord(op: unknown): op is Horizon.ServerApi.PaymentOperationRecord {
  if (!op || typeof op !== "object") {
    return false;
  }

  const record = op as Record<string, unknown>;

  return (
    typeof record["to"] === "string" &&
    typeof record["from"] === "string" &&
    typeof record["amount"] === "string" &&
    (record["asset_type"] === "native" ||
      (typeof record["asset_code"] === "string" && typeof record["asset_issuer"] === "string"))
  );
}

function isMatchingAsset(
  op: Horizon.ServerApi.PaymentOperationRecord,
  assetCode: string,
  assetIssuer: string | null,
): boolean {
  if (assetCode === "XLM" && assetIssuer === null) {
    return op.asset_type === "native";
  }

  return op.asset_code === assetCode && op.asset_issuer === assetIssuer;
}

function isSufficientAmount(actual: string, minimum: string): boolean {
  const a = parseFloat(actual);
  const m = parseFloat(minimum);

  if (!isFinite(a) || !isFinite(m)) {
    return false;
  }

  return a >= m;
}
