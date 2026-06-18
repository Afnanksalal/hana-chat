import { Indexer, MemData, type UploadOption } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { createHash } from "node:crypto";

export type OgSnapshotKind = "conversation_memory" | "creator_soul_pack" | "user_export";
export type OgStorageEncryptionMode = "0g-storage-ecies-v1";

export interface OgMemorySnapshotFact {
  id: string;
  kind: string;
  importance: number;
  emotionalWeight: number;
  updatedAt: string;
  text: string;
  sourceMessageIds: string[];
}

export interface OgMemorySnapshotManifestInput {
  snapshotKind: OgSnapshotKind;
  network: string;
  userId: string;
  characterId: string;
  conversationId: string;
  facts: OgMemorySnapshotFact[];
  createdAt?: string;
}

export interface OgMemorySnapshotManifest {
  schemaVersion: 1;
  snapshotKind: OgSnapshotKind;
  network: string;
  userId: string;
  characterId: string;
  conversationId: string;
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

export interface OgMemorySnapshotCommitment {
  manifest: OgMemorySnapshotManifest;
  manifestHash: string;
  rootHash: string;
  sourceMemoryIds: string[];
}

export interface OgMemorySnapshotEncryptedPayload {
  schemaVersion: 1;
  payloadKind: "hana.memory.snapshot.encrypted.v1";
  manifest: OgMemorySnapshotManifest;
  facts: OgMemorySnapshotFact[];
}

export interface OgStorageUploadOptions {
  rpcUrl: string;
  indexerUrl: string;
  signerPrivateKey: string;
  encryptionKeyRef: string;
  expectedReplica?: number;
  taskSize?: number;
  finalityRequired?: boolean;
  skipTx?: boolean;
}

export interface OgStorageUploadResult {
  rootHash: string;
  txHash: string | null;
  manifestHash: string;
  payloadHash: string;
  sourceMemoryIds: string[];
  encryptionMode: OgStorageEncryptionMode;
  encryptionKeyRef: string;
  signerAddress: string;
  localMerkleRoot: string | null;
  uploadedAt: string;
}

export interface OgStorageDownloadOptions {
  indexerUrl: string;
  rootHash: string;
  signerPrivateKey: string;
  verifyProof?: boolean;
}

export function buildMemorySnapshotCommitment(
  input: OgMemorySnapshotManifestInput,
): OgMemorySnapshotCommitment {
  const sourceMemoryIds = input.facts.map((fact) => fact.id);
  const manifest: OgMemorySnapshotManifest = {
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
  const rootHash = sha256Hex(`hana-og-snapshot-v1:${manifestHash}:${sourceMemoryIds.join(",")}`);

  return {
    manifest,
    manifestHash,
    rootHash,
    sourceMemoryIds,
  };
}

export async function uploadEncryptedMemorySnapshotTo0g(
  input: OgMemorySnapshotManifestInput,
  options: OgStorageUploadOptions,
): Promise<OgStorageUploadResult> {
  const commitment = buildMemorySnapshotCommitment(input);
  const payload: OgMemorySnapshotEncryptedPayload = {
    schemaVersion: 1,
    payloadKind: "hana.memory.snapshot.encrypted.v1",
    manifest: commitment.manifest,
    facts: input.facts,
  };
  const payloadJson = stableStringify(payload);
  const payloadHash = sha256Hex(payloadJson);
  const memData = new MemData(new TextEncoder().encode(payloadJson));
  const [tree, treeError] = await memData.merkleTree();

  if (treeError !== null) {
    throw new Error(`0G memory snapshot merkle calculation failed: ${treeError.message}`);
  }

  const provider = new ethers.JsonRpcProvider(options.rpcUrl);
  const signer = new ethers.Wallet(options.signerPrivateKey, provider);
  const recipientPubKey = ethers.SigningKey.computePublicKey(signer.signingKey.publicKey, true);
  const indexer = new Indexer(options.indexerUrl);
  const uploadOptions: UploadOption = {
    expectedReplica: options.expectedReplica ?? 1,
    taskSize: options.taskSize ?? 10,
    finalityRequired: options.finalityRequired ?? true,
    skipIfFinalized: true,
    encryption: {
      type: "ecies",
      recipientPubKey,
    },
  };

  if (options.skipTx !== undefined) {
    uploadOptions.skipTx = options.skipTx;
  }

  const [tx, uploadError] = await indexer.upload(memData, options.rpcUrl, signer, uploadOptions);

  if (uploadError !== null) {
    throw new Error(`0G memory snapshot upload failed: ${uploadError.message}`);
  }

  const normalized = normalizeUploadResult(tx);

  return {
    rootHash: normalized.rootHash,
    txHash: normalized.txHash,
    manifestHash: commitment.manifestHash,
    payloadHash,
    sourceMemoryIds: commitment.sourceMemoryIds,
    encryptionMode: "0g-storage-ecies-v1",
    encryptionKeyRef: options.encryptionKeyRef,
    signerAddress: await signer.getAddress(),
    localMerkleRoot: tree ? String(tree.rootHash()) : null,
    uploadedAt: new Date().toISOString(),
  };
}

export async function downloadEncryptedMemorySnapshotFrom0g(
  options: OgStorageDownloadOptions,
): Promise<OgMemorySnapshotEncryptedPayload> {
  const indexer = new Indexer(options.indexerUrl);
  const [blob, downloadError] = await indexer.downloadToBlob(options.rootHash, {
    proof: options.verifyProof ?? true,
    decryption: {
      privateKey: options.signerPrivateKey,
    },
  });

  if (downloadError !== null) {
    throw new Error(`0G memory snapshot download failed: ${downloadError.message}`);
  }

  const text = await blob.text();
  const parsed = JSON.parse(text) as unknown;

  if (!isMemorySnapshotEncryptedPayload(parsed)) {
    throw new Error("0G memory snapshot download returned an unexpected payload");
  }

  return parsed;
}

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

function normalizeUploadResult(
  tx:
    | {
        txHash: string;
        rootHash: string;
        txSeq: number;
      }
    | {
        txHashes: string[];
        rootHashes: string[];
        txSeqs: number[];
      },
): { rootHash: string; txHash: string | null } {
  if ("rootHash" in tx) {
    return {
      rootHash: tx.rootHash,
      txHash: tx.txHash,
    };
  }

  const rootHash = tx.rootHashes[0];

  if (!rootHash) {
    throw new Error("0G memory snapshot upload did not return a root hash");
  }

  return {
    rootHash,
    txHash: tx.txHashes[0] ?? null,
  };
}

function isMemorySnapshotEncryptedPayload(
  value: unknown,
): value is OgMemorySnapshotEncryptedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    payload["schemaVersion"] === 1 &&
    payload["payloadKind"] === "hana.memory.snapshot.encrypted.v1" &&
    Boolean(payload["manifest"]) &&
    Array.isArray(payload["facts"])
  );
}
