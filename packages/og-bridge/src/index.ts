import { createHash } from "node:crypto";

export type OgSnapshotKind = "conversation_memory" | "creator_soul_pack" | "user_export";

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
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}
