import type { MemoryId, MemoryKind, MemoryScope, MessageId } from "@hana/contracts";

export interface MemoryFact {
  id: MemoryId;
  userId: string;
  characterId?: string;
  conversationId?: string;
  scope: MemoryScope;
  kind: MemoryKind;
  text: string;
  normalizedText: string;
  confidence: number;
  importance: number;
  emotionalWeight: number;
  sourceMessageIds: MessageId[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  supersededBy?: MemoryId;
  isActive: boolean;
}

export interface SalienceSignals {
  explicitMemorySignal: number;
  emotionalIntensity: number;
  recurrenceSignal: number;
  relationshipImpact: number;
  preferenceOrBoundarySignal: number;
  novelty: number;
}

export interface RetrievalSignals {
  semanticSimilarity: number;
  importance: number;
  recencyDecay: number;
  relationshipRelevance: number;
  currentTopicOverlap: number;
  lastUsedPenalty: number;
}

export interface TokenBudget {
  systemPersona: number;
  policySafety: number;
  characterCard: number;
  relationshipMemory: number;
  userProfileMemory: number;
  episodicRecall: number;
  recentMessages: number;
  response: number;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  systemPersona: 1_200,
  policySafety: 500,
  characterCard: 900,
  relationshipMemory: 600,
  userProfileMemory: 300,
  episodicRecall: 700,
  recentMessages: 2_400,
  response: 400,
};

export function scoreSalience(signals: SalienceSignals): number {
  return clamp01(
    0.3 * signals.explicitMemorySignal +
      0.2 * signals.emotionalIntensity +
      0.15 * signals.recurrenceSignal +
      0.15 * signals.relationshipImpact +
      0.1 * signals.preferenceOrBoundarySignal +
      0.1 * signals.novelty,
  );
}

export function memoryWriteAction(score: number): "write_now" | "candidate" | "skip" {
  if (score >= 0.7) {
    return "write_now";
  }
  if (score >= 0.45) {
    return "candidate";
  }

  return "skip";
}

export function scoreRetrieval(signals: RetrievalSignals): number {
  return clamp01(
    0.4 * signals.semanticSimilarity +
      0.2 * signals.importance +
      0.15 * signals.recencyDecay +
      0.1 * signals.relationshipRelevance +
      0.1 * signals.currentTopicOverlap -
      0.05 * signals.lastUsedPenalty,
  );
}

export function recencyDecay(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) {
    return 0;
  }

  return Math.exp(-ageDays / halfLifeDays);
}

export function normalizeMemoryText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function totalTokenBudget(budget: TokenBudget): number {
  return (
    budget.systemPersona +
    budget.policySafety +
    budget.characterCard +
    budget.relationshipMemory +
    budget.userProfileMemory +
    budget.episodicRecall +
    budget.recentMessages +
    budget.response
  );
}
