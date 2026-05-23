import type { MemoryScope } from "@hana/contracts";
import { scoreRetrieval } from "@hana/memory-core";

export interface QdrantMemoryPayload {
  memoryId: string;
  userId: string;
  characterId?: string;
  conversationId?: string;
  scope: MemoryScope;
  kind: string;
  importance: number;
  confidence: number;
  emotionalWeight: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  source: "fact" | "event" | "summary" | "character";
}

export interface VectorMemoryHit {
  payload: QdrantMemoryPayload;
  semanticSimilarity: number;
}

export interface GraphMemoryHit {
  memoryId: string;
  relationshipRelevance: number;
  currentTopicOverlap: number;
  reason: string;
}

export interface RankedMemoryHit {
  memoryId: string;
  score: number;
  source: "vector" | "graph" | "hybrid";
}

export function mergeAndRankMemoryHits(input: {
  vectorHits: VectorMemoryHit[];
  graphHits: GraphMemoryHit[];
  now: Date;
  maxResults: number;
}): RankedMemoryHit[] {
  const graphByMemory = new Map(input.graphHits.map((hit) => [hit.memoryId, hit]));

  const ranked: RankedMemoryHit[] = input.vectorHits.map((hit) => {
    const graphHit = graphByMemory.get(hit.payload.memoryId);
    const ageDays =
      (input.now.getTime() - new Date(hit.payload.updatedAt).getTime()) / (1000 * 60 * 60 * 24);

    return {
      memoryId: hit.payload.memoryId,
      score: scoreRetrieval({
        semanticSimilarity: hit.semanticSimilarity,
        importance: hit.payload.importance,
        recencyDecay: Math.exp(-ageDays / 60),
        relationshipRelevance: graphHit?.relationshipRelevance ?? 0.3,
        currentTopicOverlap: graphHit?.currentTopicOverlap ?? 0.3,
        lastUsedPenalty: 0,
      }),
      source: graphHit ? "hybrid" : "vector",
    } satisfies RankedMemoryHit;
  });

  for (const graphHit of input.graphHits) {
    if (!ranked.some((hit) => hit.memoryId === graphHit.memoryId)) {
      ranked.push({
        memoryId: graphHit.memoryId,
        score: scoreRetrieval({
          semanticSimilarity: 0.3,
          importance: 0.6,
          recencyDecay: 0.6,
          relationshipRelevance: graphHit.relationshipRelevance,
          currentTopicOverlap: graphHit.currentTopicOverlap,
          lastUsedPenalty: 0,
        }),
        source: "graph",
      });
    }
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, input.maxResults);
}
