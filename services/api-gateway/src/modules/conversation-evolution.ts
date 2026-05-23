import { type HanaDatabase } from "@hana/database";
import type { Kysely } from "kysely";

type Db = Kysely<HanaDatabase>;
type EvolutionStage = "new" | "warming" | "attuned" | "bonded";

interface MemorySignal {
  id: string;
  kind: string;
  text: string;
  importance: number;
  emotional_weight: number;
  updated_at: Date;
}

export interface ConversationEvolutionSummary {
  stage: EvolutionStage;
  relationshipDepth: number;
  memoryCount: number;
  userMessageCount: number;
  summary: string;
  styleProfile: {
    preferences: string[];
    boundaries: string[];
    relationship: string[];
    canon: string[];
    style: string[];
  };
  updatedAt: string;
}

export async function getConversationEvolution(
  db: Db,
  conversationId: string,
): Promise<ConversationEvolutionSummary | null> {
  const row = await db
    .selectFrom("chat.conversation_evolution")
    .selectAll()
    .where("conversation_id", "=", conversationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return toEvolutionSummary(row);
}

export async function upsertConversationEvolution(
  db: Db,
  input: {
    userId: string;
    characterId: string;
    conversationId: string;
  },
): Promise<ConversationEvolutionSummary> {
  const [memories, messageCountRow] = await Promise.all([
    db
      .selectFrom("memory.facts")
      .select(["id", "kind", "text", "importance", "emotional_weight", "updated_at"])
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("scope", "=", "conversation")
      .where("kind", "not in", ["safety", "system"])
      .where("is_active", "=", true)
      .orderBy("importance", "desc")
      .orderBy("updated_at", "desc")
      .limit(40)
      .execute(),
    db
      .selectFrom("chat.messages")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("role", "=", "user")
      .executeTakeFirst(),
  ]);
  const userMessageCount = Number(messageCountRow?.count ?? 0);
  const evolution = deriveEvolution(memories, userMessageCount);
  const now = new Date();
  const row = await db
    .insertInto("chat.conversation_evolution")
    .values({
      conversation_id: input.conversationId,
      user_id: input.userId,
      character_id: input.characterId,
      stage: evolution.stage,
      relationship_depth: evolution.relationshipDepth,
      memory_count: memories.length,
      user_message_count: userMessageCount,
      source_memory_ids: memories.map((memory) => memory.id),
      style_profile_json: evolution.styleProfile,
      summary: evolution.summary,
      updated_at: now,
      last_evolved_at: now,
    })
    .onConflict((oc) =>
      oc.column("conversation_id").doUpdateSet({
        stage: evolution.stage,
        relationship_depth: evolution.relationshipDepth,
        memory_count: memories.length,
        user_message_count: userMessageCount,
        source_memory_ids: memories.map((memory) => memory.id),
        style_profile_json: evolution.styleProfile,
        summary: evolution.summary,
        updated_at: now,
        last_evolved_at: now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  return toEvolutionSummary(row);
}

export function formatEvolutionForPrompt(evolution: ConversationEvolutionSummary | null): string {
  if (!evolution) {
    return "This conversation has not evolved yet. Let the character learn naturally from this chat.";
  }

  const profile = evolution.styleProfile;
  const lines = [
    `Stage: ${evolution.stage}`,
    `Relationship depth: ${evolution.relationshipDepth}/100`,
    `Conversation turns from user: ${evolution.userMessageCount}`,
    `Active saved memories: ${evolution.memoryCount}`,
    "Evolution summary:",
    evolution.summary,
  ];

  if (profile.preferences.length) {
    lines.push("Preferences to honor:", ...profile.preferences.map((item) => `- ${item}`));
  }

  if (profile.relationship.length) {
    lines.push("Relationship cues:", ...profile.relationship.map((item) => `- ${item}`));
  }

  if (profile.style.length) {
    lines.push("Adapted style:", ...profile.style.map((item) => `- ${item}`));
  }

  if (profile.boundaries.length) {
    lines.push("Boundaries:", ...profile.boundaries.map((item) => `- ${item}`));
  }

  if (profile.canon.length) {
    lines.push("Shared canon and events:", ...profile.canon.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

function deriveEvolution(
  memories: MemorySignal[],
  userMessageCount: number,
): Omit<ConversationEvolutionSummary, "updatedAt"> {
  const relationshipDepth = Math.min(
    100,
    Math.round(
      userMessageCount * 2 +
        memories.length * 5 +
        memories.reduce((sum, memory) => sum + memory.emotional_weight * 8, 0),
    ),
  );
  const stage = stageForDepth(relationshipDepth, memories.length, userMessageCount);
  const styleProfile = {
    preferences: topMemoryTexts(memories, ["preference"], 4),
    boundaries: topMemoryTexts(memories, ["boundary"], 4),
    relationship: topMemoryTexts(memories, ["relationship"], 4),
    canon: topMemoryTexts(memories, ["canon", "event"], 5),
    style: topMemoryTexts(memories, ["style"], 4),
  };
  const summary = buildEvolutionSummary({
    stage,
    relationshipDepth,
    memories,
    userMessageCount,
    styleProfile,
  });

  return {
    stage,
    relationshipDepth,
    memoryCount: memories.length,
    userMessageCount,
    summary,
    styleProfile,
  };
}

function stageForDepth(
  relationshipDepth: number,
  memoryCount: number,
  userMessageCount: number,
): EvolutionStage {
  if (relationshipDepth >= 70 || memoryCount >= 10 || userMessageCount >= 30) {
    return "bonded";
  }

  if (relationshipDepth >= 40 || memoryCount >= 5 || userMessageCount >= 14) {
    return "attuned";
  }

  if (relationshipDepth >= 15 || memoryCount >= 2 || userMessageCount >= 4) {
    return "warming";
  }

  return "new";
}

function topMemoryTexts(memories: MemorySignal[], kinds: string[], limit: number): string[] {
  return memories
    .filter((memory) => kinds.includes(memory.kind))
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        right.updated_at.getTime() - left.updated_at.getTime(),
    )
    .slice(0, limit)
    .map((memory) => clipMemory(memory.text));
}

function buildEvolutionSummary(input: {
  stage: EvolutionStage;
  relationshipDepth: number;
  memories: MemorySignal[];
  userMessageCount: number;
  styleProfile: ConversationEvolutionSummary["styleProfile"];
}): string {
  if (input.memories.length === 0) {
    return `The relationship is ${input.stage}. The character should stay curious, ask grounded follow-ups, and begin adapting from the user's choices in this room.`;
  }

  const strongest = input.memories
    .slice(0, 4)
    .map((memory) => `${memory.kind}: ${clipMemory(memory.text)}`)
    .join("; ");
  const styleHint = input.styleProfile.style[0] ?? input.styleProfile.preferences[0];
  const relationshipHint = input.styleProfile.relationship[0];
  const suffix = [
    styleHint ? `Adapt tone around: ${styleHint}` : "",
    relationshipHint ? `Carry relationship continuity from: ${relationshipHint}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `The relationship is ${input.stage} at depth ${input.relationshipDepth}/100 after ${input.userMessageCount} user turns. Most important continuity: ${strongest}.${suffix ? ` ${suffix}` : ""}`;
}

function toEvolutionSummary(row: {
  stage: EvolutionStage;
  relationship_depth: number;
  memory_count: number;
  user_message_count: number;
  style_profile_json: unknown;
  summary: string;
  updated_at: Date;
}): ConversationEvolutionSummary {
  return {
    stage: row.stage,
    relationshipDepth: row.relationship_depth,
    memoryCount: row.memory_count,
    userMessageCount: row.user_message_count,
    summary: row.summary,
    styleProfile: normalizeStyleProfile(row.style_profile_json),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeStyleProfile(value: unknown): ConversationEvolutionSummary["styleProfile"] {
  if (!value || typeof value !== "object") {
    return { preferences: [], boundaries: [], relationship: [], canon: [], style: [] };
  }

  const record = value as Record<string, unknown>;

  return {
    preferences: stringArray(record["preferences"]),
    boundaries: stringArray(record["boundaries"]),
    relationship: stringArray(record["relationship"]),
    canon: stringArray(record["canon"]),
    style: stringArray(record["style"]),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function clipMemory(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();

  return compact.length <= 180 ? compact : `${compact.slice(0, 164).trimEnd()} [truncated]`;
}
