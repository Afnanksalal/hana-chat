import type { AppConfig } from "@hana/config";
import { embedTextForRetrieval } from "./vector-memory";

export interface CharacterVectorRecord {
  id: string;
  creatorUserId: string;
  name: string;
  description: string;
  personaPrompt: string;
  greeting: string;
  scenarioPrompt?: string | null;
  speakingStyle?: string | null;
  personalityTraits?: string[];
  marketplaceCategory?: string | null;
  modelProfile?: string | null;
  visibility: string;
  moderationStatus: string;
  rating: string;
  tags: string[];
  priceCents: number;
  monetizationEnabled: boolean;
  updatedAt: Date;
}

export interface CharacterVectorHit {
  characterId: string;
  score: number;
}

interface QdrantCharacterPayload {
  characterId: string;
  creatorUserId: string;
  name: string;
  visibility: string;
  moderationStatus: string;
  rating: string;
  tags: string[];
  marketplaceCategory: string;
  modelProfile: string;
  priceCents: number;
  monetizationEnabled: boolean;
  updatedAt: string;
  source: "character";
}

export async function upsertCharacterVector(
  config: AppConfig,
  character: CharacterVectorRecord,
): Promise<void> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${config.QDRANT_CHARACTER_COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [
          {
            id: character.id,
            vector: embedTextForRetrieval(characterEmbeddingText(character)),
            payload: toQdrantPayload(character),
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Qdrant character upsert failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
}

export async function searchCharacterVectors(
  config: AppConfig,
  input: {
    query: string;
    limit: number;
  },
): Promise<CharacterVectorHit[]> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${config.QDRANT_CHARACTER_COLLECTION}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector: embedTextForRetrieval(input.query),
        limit: input.limit,
        with_payload: true,
        filter: {
          must: [
            { key: "visibility", match: { value: "public" } },
            { key: "moderationStatus", match: { value: "approved" } },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Qdrant character search failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

  const payload: unknown = await response.json();

  return parseQdrantHits(payload).map((hit) => ({
    characterId: hit.payload.characterId,
    score: hit.score,
  }));
}

function characterEmbeddingText(character: CharacterVectorRecord): string {
  return [
    character.name,
    character.description,
    character.personaPrompt,
    character.greeting,
    character.scenarioPrompt ?? "",
    character.speakingStyle ?? "",
    character.personalityTraits?.join(" ") ?? "",
    character.marketplaceCategory ?? "",
    character.modelProfile ?? "",
    character.rating,
    character.tags.join(" "),
  ].join("\n");
}

function toQdrantPayload(character: CharacterVectorRecord): QdrantCharacterPayload {
  return {
    characterId: character.id,
    creatorUserId: character.creatorUserId,
    name: character.name,
    visibility: character.visibility,
    moderationStatus: character.moderationStatus,
    rating: character.rating,
    tags: character.tags,
    marketplaceCategory: character.marketplaceCategory ?? "featured",
    modelProfile: character.modelProfile ?? "balanced",
    priceCents: character.priceCents,
    monetizationEnabled: character.monetizationEnabled,
    updatedAt: character.updatedAt.toISOString(),
    source: "character",
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

function parseQdrantHits(
  payload: unknown,
): Array<{ score: number; payload: QdrantCharacterPayload }> {
  if (!isRecord(payload) || !Array.isArray(payload["result"])) {
    return [];
  }

  const hits: Array<{ score: number; payload: QdrantCharacterPayload }> = [];

  for (const rawHit of payload["result"]) {
    if (!isRecord(rawHit)) {
      continue;
    }

    const rawScore = rawHit["score"];
    const rawPayload = rawHit["payload"];
    const score = typeof rawScore === "number" ? rawScore : 0;
    const hitPayload = isQdrantCharacterPayload(rawPayload) ? rawPayload : null;

    if (hitPayload) {
      hits.push({ score, payload: hitPayload });
    }
  }

  return hits;
}

function isQdrantCharacterPayload(payload: unknown): payload is QdrantCharacterPayload {
  return (
    isRecord(payload) &&
    typeof payload["characterId"] === "string" &&
    typeof payload["creatorUserId"] === "string" &&
    typeof payload["name"] === "string" &&
    typeof payload["visibility"] === "string" &&
    typeof payload["moderationStatus"] === "string" &&
    typeof payload["rating"] === "string" &&
    Array.isArray(payload["tags"]) &&
    payload["tags"].every((tag) => typeof tag === "string") &&
    typeof payload["marketplaceCategory"] === "string" &&
    typeof payload["modelProfile"] === "string" &&
    typeof payload["priceCents"] === "number" &&
    typeof payload["monetizationEnabled"] === "boolean" &&
    typeof payload["updatedAt"] === "string" &&
    payload["source"] === "character"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
