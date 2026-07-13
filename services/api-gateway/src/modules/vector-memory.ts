import type { AppConfig } from "@hana/config";
import { createHash } from "node:crypto";

const VECTOR_SIZE = 1536;
const GLOBAL_CHARACTER_ID = "__global__";
const NO_CONVERSATION_ID = "__none__";

export interface MemoryVectorRecord {
  id: string;
  userId: string;
  characterId: string | null;
  conversationId: string | null;
  scope: string;
  kind: string;
  text: string;
  confidence: number;
  importance: number;
  emotionalWeight: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface MemoryVectorHit {
  memoryId: string;
  score: number;
}

interface QdrantMemoryPayload {
  memoryId: string;
  userId: string;
  characterId: string;
  conversationId: string;
  scope: string;
  kind: string;
  importance: number;
  confidence: number;
  emotionalWeight: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  source: "fact";
}

export async function upsertMemoryVector(
  config: AppConfig,
  memory: MemoryVectorRecord,
): Promise<void> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${config.QDRANT_MEMORY_COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [
          {
            id: memory.id,
            vector: embedTextForRetrieval(memory.text),
            payload: toQdrantPayload(memory),
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Qdrant memory upsert failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

}

export async function deleteMemoryVector(config: AppConfig, memoryId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${config.QDRANT_MEMORY_COLLECTION}/points/delete?wait=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [memoryId],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Qdrant memory delete failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

}

export async function searchMemoryVectors(
  config: AppConfig,
  input: {
    userId: string;
    characterId: string;
    conversationId: string;
    query: string;
    limit: number;
  },
): Promise<MemoryVectorHit[]> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${config.QDRANT_MEMORY_COLLECTION}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector: embedTextForRetrieval(input.query),
        limit: Math.max(input.limit * 3, input.limit),
        with_payload: true,
        filter: {
          must: [
            { key: "userId", match: { value: input.userId } },
            { key: "characterId", match: { value: input.characterId } },
            { key: "conversationId", match: { value: input.conversationId } },
            { key: "scope", match: { value: "conversation" } },
            { key: "isActive", match: { value: true } },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Qdrant memory search failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

  const payload: unknown = await response.json();

  return parseQdrantHits(payload)
    .filter(
      (hit) =>
        hit.payload.characterId === input.characterId &&
        hit.payload.conversationId === input.conversationId &&
        hit.payload.scope === "conversation",
    )
    .slice(0, input.limit)
    .map((hit) => ({
      memoryId: hit.payload.memoryId,
      score: hit.score,
    }));
}

function toQdrantPayload(memory: MemoryVectorRecord): QdrantMemoryPayload {
  return {
    memoryId: memory.id,
    userId: memory.userId,
    characterId: memory.characterId ?? GLOBAL_CHARACTER_ID,
    conversationId: memory.conversationId ?? NO_CONVERSATION_ID,
    scope: memory.scope,
    kind: memory.kind,
    importance: memory.importance,
    confidence: memory.confidence,
    emotionalWeight: memory.emotionalWeight,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    isActive: memory.isActive,
    source: "fact",
  };
}

function qdrantBaseUrl(config: AppConfig): string {
  return config.QDRANT_URL.replace(/\/+$/, "");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 5_000,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  return fetch(url, { ...init, signal: abortController.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

export function embedTextForRetrieval(text: string): number[] {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token) {
      continue;
    }

    addFeature(vector, token, 1);

    const nextToken = tokens[index + 1];

    if (nextToken) {
      addFeature(vector, `${token} ${nextToken}`, 0.65);
    }
  }

  let norm = 0;

  for (const value of vector) {
    norm += value * value;
  }

  norm = Math.sqrt(norm);

  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }

  return vector.map((value) => value / norm);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function addFeature(vector: number[], feature: string, weight: number): void {
  const digest = createHash("sha256").update(feature).digest();
  const dimension = digest.readUInt32BE(0) % VECTOR_SIZE;
  const sign = (digest[4] ?? 0) % 2 === 0 ? 1 : -1;
  const scaledWeight = weight * (1 + Math.log1p(feature.length));

  vector[dimension] = (vector[dimension] ?? 0) + sign * scaledWeight;
}

function parseQdrantHits(payload: unknown): Array<{ score: number; payload: QdrantMemoryPayload }> {
  if (!isRecord(payload) || !Array.isArray(payload["result"])) {
    return [];
  }

  const hits: Array<{ score: number; payload: QdrantMemoryPayload }> = [];

  for (const rawHit of payload["result"]) {
    if (!isRecord(rawHit)) {
      continue;
    }

    const rawScore = rawHit["score"];
    const rawPayload = rawHit["payload"];
    const score = typeof rawScore === "number" ? rawScore : 0;
    const hitPayload = isQdrantMemoryPayload(rawPayload) ? rawPayload : null;

    if (hitPayload) {
      hits.push({ score, payload: hitPayload });
    }
  }

  return hits;
}

function isQdrantMemoryPayload(payload: unknown): payload is QdrantMemoryPayload {
  return (
    isRecord(payload) &&
    typeof payload["memoryId"] === "string" &&
    typeof payload["userId"] === "string" &&
    typeof payload["characterId"] === "string" &&
    typeof payload["conversationId"] === "string" &&
    typeof payload["scope"] === "string" &&
    typeof payload["kind"] === "string" &&
    typeof payload["importance"] === "number" &&
    typeof payload["confidence"] === "number" &&
    typeof payload["emotionalWeight"] === "number" &&
    typeof payload["createdAt"] === "string" &&
    typeof payload["updatedAt"] === "string" &&
    typeof payload["isActive"] === "boolean" &&
    payload["source"] === "fact"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
