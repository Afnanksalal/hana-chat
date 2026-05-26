import { type HanaDatabase } from "@hana/database";
import type { Kysely } from "kysely";

type Db = Kysely<HanaDatabase>;
type EvolutionStage = "new" | "warming" | "attuned" | "bonded";
type RelationshipState =
  | "unformed"
  | "tense"
  | "rivalry"
  | "repairing"
  | "friendly"
  | "romantic"
  | "intimate";

interface MemorySignal {
  id: string;
  kind: string;
  text: string;
  importance: number;
  emotional_weight: number;
  updated_at: Date;
}

interface RecentMessageSignal {
  role: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
}

interface RelationshipAnalysis {
  state: RelationshipState;
  label: string;
  positiveSignals: number;
  tensionSignals: number;
  romanceSignals: number;
  explicitConflict: boolean;
  explicitRomance: boolean;
  recentSignals: string[];
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
    relationshipState: string;
    userProfile: string[];
    soul: string[];
    milestones: string[];
    adaptiveSkills: string[];
    openLoops: string[];
    recentSignals: string[];
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
  const [memories, messageCountRow, recentMessages] = await Promise.all([
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
      .limit(60)
      .execute(),
    db
      .selectFrom("chat.messages")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("role", "=", "user")
      .executeTakeFirst(),
    db
      .selectFrom("chat.messages")
      .select(["role", "content", "created_at"])
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .orderBy("created_at", "desc")
      .limit(36)
      .execute(),
  ]);
  const userMessageCount = Number(messageCountRow?.count ?? 0);
  const evolution = deriveEvolution(memories, userMessageCount, recentMessages.reverse());
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
    `Relationship state: ${profile.relationshipState}`,
    `Conversation turns from user: ${evolution.userMessageCount}`,
    `Active saved memories: ${evolution.memoryCount}`,
    "Evolution model: compacted from live scoped facts and recent turns; it can keep evolving as more room-specific evidence is saved.",
    "Continuity rule: relationship changes must be earned from explicit conversation evidence. Kindness can soften tension without instantly becoming romance.",
    "Evolution summary:",
    evolution.summary,
  ];

  if (profile.userProfile.length) {
    lines.push("User profile cues:", ...profile.userProfile.map((item) => `- ${item}`));
  }

  if (profile.soul.length) {
    lines.push("Character soul profile:", ...profile.soul.map((item) => `- ${item}`));
  }

  if (profile.milestones.length) {
    lines.push("Relationship milestones:", ...profile.milestones.map((item) => `- ${item}`));
  }

  if (profile.recentSignals.length) {
    lines.push("Recent signals:", ...profile.recentSignals.map((item) => `- ${item}`));
  }

  if (profile.adaptiveSkills.length) {
    lines.push("Adaptive roleplay habits:", ...profile.adaptiveSkills.map((item) => `- ${item}`));
  }

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

  if (profile.openLoops.length) {
    lines.push("Open scene threads:", ...profile.openLoops.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

export function deriveEvolution(
  memories: MemorySignal[],
  userMessageCount: number,
  recentMessages: RecentMessageSignal[] = [],
): Omit<ConversationEvolutionSummary, "updatedAt"> {
  const relationship = analyzeRelationship(memories, recentMessages);
  const memoryDepth = memories.reduce(
    (sum, memory) => sum + memory.importance * 3.2 + memory.emotional_weight * 5,
    0,
  );
  const turnDepth = Math.min(34, userMessageCount * 1.35);
  const signalDepth =
    relationship.positiveSignals * 3.5 +
    relationship.romanceSignals * 4 -
    relationship.tensionSignals * 1.5;
  const unearnedRomanceCap =
    relationship.explicitConflict && !relationship.explicitRomance ? 48 : 100;
  const relationshipDepth = Math.min(
    unearnedRomanceCap,
    Math.max(0, Math.round(turnDepth + memoryDepth + signalDepth)),
  );
  const stage = stageForDepth(relationshipDepth, memories.length, userMessageCount, relationship);
  const styleProfile = {
    preferences: topMemoryTexts(memories, ["preference"], 4),
    boundaries: topMemoryTexts(memories, ["boundary"], 4),
    relationship: topMemoryTexts(memories, ["relationship"], 5),
    canon: topMemoryTexts(memories, ["canon", "event"], 6),
    style: topMemoryTexts(memories, ["style"], 4),
    relationshipState: relationship.label,
    userProfile: deriveUserProfile(memories, recentMessages),
    soul: deriveSoulProfile(memories, recentMessages, relationship),
    milestones: deriveMilestones(memories, recentMessages, relationship),
    adaptiveSkills: deriveAdaptiveSkills(memories, recentMessages, relationship),
    openLoops: deriveOpenLoops(recentMessages),
    recentSignals: relationship.recentSignals,
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

function analyzeRelationship(
  memories: MemorySignal[],
  recentMessages: RecentMessageSignal[],
): RelationshipAnalysis {
  const memoryText = memories
    .map((memory) => memory.text)
    .join("\n")
    .toLowerCase();
  const recentText = recentMessages
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();
  const text = `${memoryText}\n${recentText}`;
  const recentUserText = recentMessages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();
  const recentAssistantText = recentMessages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();
  const tensionSignals = countMatches(text, [
    /\benem(?:y|ies)\b/g,
    /\brivals?\b/g,
    /\bdon't trust\b/g,
    /\bdo not trust\b/g,
    /\bhate you\b/g,
    /\bbetrayed\b/g,
    /\bfought\b/g,
    /\bargued\b/g,
  ]);
  const positiveSignals = countMatches(text, [
    /\btrust you\b/g,
    /\bforgive\b/g,
    /\bsorry\b/g,
    /\bthank you\b/g,
    /\bcared for\b/g,
    /\bprotected\b/g,
    /\bsaved you\b/g,
    /\bhelped you\b/g,
  ]);
  const romanceSignals = countMatches(text, [
    /\blove you\b/g,
    /\bgirlfriend\b/g,
    /\bboyfriend\b/g,
    /\blover\b/g,
    /\bpartners?\b/g,
    /\bpartnership\b/g,
    /\bdating\b/g,
    /\bkiss(?:ed| me)?\b/g,
    /\bintimate\b/g,
  ]);
  const explicitConflict =
    conflictEvidence(recentUserText) || conflictEvidence(memoryText) || conflictEvidence(recentText);
  const explicitRomance = romanticEvidence({
    memoryText,
    recentUserText,
    recentAssistantText,
    recentText,
  });
  const state = chooseRelationshipState({
    tensionSignals,
    positiveSignals,
    romanceSignals,
    explicitConflict,
    explicitRomance,
  });
  const recentSignals = deriveRecentSignals({
    recentUserText,
    recentText,
    tensionSignals,
    positiveSignals,
    romanceSignals,
    explicitConflict,
    explicitRomance,
  });

  return {
    state,
    label: relationshipStateLabel(state),
    positiveSignals,
    tensionSignals,
    romanceSignals,
    explicitConflict,
    explicitRomance,
    recentSignals,
  };
}

function chooseRelationshipState(input: {
  tensionSignals: number;
  positiveSignals: number;
  romanceSignals: number;
  explicitConflict: boolean;
  explicitRomance: boolean;
}): RelationshipState {
  if (input.explicitRomance && input.romanceSignals >= 2) {
    return "intimate";
  }

  if (input.explicitRomance) {
    return "romantic";
  }

  if (input.explicitConflict && input.positiveSignals > 0) {
    return "repairing";
  }

  if (input.explicitConflict || input.tensionSignals >= 3) {
    return input.tensionSignals >= 4 ? "rivalry" : "tense";
  }

  if (input.positiveSignals >= 3) {
    return "friendly";
  }

  if (input.positiveSignals > 0 || input.tensionSignals > 0) {
    return "repairing";
  }

  return "unformed";
}

function conflictEvidence(text: string): boolean {
  return /\b(?:we (?:are|were|used to be) (?:enemies|rivals)|we're (?:enemies|rivals)|i don't trust you|i do not trust you|i hate you|you betrayed me|relationship state:.*(?:enemies|rivals|distrust|tension))\b/i.test(
    text,
  );
}

function romanticEvidence(input: {
  memoryText: string;
  recentUserText: string;
  recentAssistantText: string;
  recentText: string;
}): boolean {
  const establishedMemory =
    /\brelationship state:.*(?:romantic partnership|lovers|dating|girlfriend|boyfriend|explicitly romantic|explicitly intimate)\b/i.test(
      input.memoryText,
    );
  const explicitUser =
    /\b(?:we (?:are|were) (?:lovers|dating|partners)|we're (?:lovers|dating|partners)|girlfriend|boyfriend|i love you|kiss me|be my girlfriend|be my boyfriend)\b/i.test(
      input.recentUserText,
    );
  const assistantAccepted =
    /\b(?:i love you too|i'm your girlfriend|i am your girlfriend|i'm your boyfriend|i am your boyfriend|as your girlfriend|as your boyfriend|we're dating|we are dating|we're together|we are together|we're lovers|we are lovers)\b/i.test(
      input.recentAssistantText,
    );
  const allRecentEstablished =
    /\b(?:we're dating|we are dating|we're together|we are together|we're lovers|we are lovers)\b/i.test(
      input.recentText,
    );

  return establishedMemory || (explicitUser && assistantAccepted) || allRecentEstablished;
}

function relationshipStateLabel(state: RelationshipState): string {
  switch (state) {
    case "tense":
      return "tense/distrustful";
    case "rivalry":
      return "rivalry or enemies-to-trust slow burn";
    case "repairing":
      return "repairing trust with cautious warmth";
    case "friendly":
      return "friendly and familiar";
    case "romantic":
      return "explicitly romantic but still consent-paced";
    case "intimate":
      return "explicitly intimate and consent-paced";
    case "unformed":
    default:
      return "unformed/new";
  }
}

function deriveRecentSignals(input: {
  recentUserText: string;
  recentText: string;
  tensionSignals: number;
  positiveSignals: number;
  romanceSignals: number;
  explicitConflict: boolean;
  explicitRomance: boolean;
}): string[] {
  const signals: string[] = [];

  if (input.explicitConflict) {
    signals.push("The user recently framed conflict, distrust, or rivalry as active.");
  }

  if (input.positiveSignals > 0) {
    signals.push("Recent turns include care, repair, gratitude, protection, or trust signals.");
  }

  if (input.explicitRomance || input.romanceSignals > 1) {
    signals.push(
      "Romantic or intimate language exists, but escalation still needs consent and continuity.",
    );
  }

  if (/\b(?:romantic partnership|we're dating|we are dating|i love you too)\b/i.test(input.recentText)) {
    signals.push("Recent turns include reciprocal romantic-state evidence.");
  }

  if (/\b(?:slow burn|don't rush|do not rush|slower)\b/i.test(input.recentUserText)) {
    signals.push("The user wants slower pacing and earned emotional movement.");
  }

  return signals.slice(0, 5);
}

function stageForDepth(
  relationshipDepth: number,
  memoryCount: number,
  userMessageCount: number,
  relationship: RelationshipAnalysis,
): EvolutionStage {
  if (
    relationshipDepth >= 72 ||
    (memoryCount >= 12 && userMessageCount >= 28 && relationship.state !== "tense")
  ) {
    return "bonded";
  }

  if (relationshipDepth >= 44 || memoryCount >= 7 || userMessageCount >= 18) {
    return "attuned";
  }

  if (relationshipDepth >= 16 || memoryCount >= 2 || userMessageCount >= 5) {
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

function deriveUserProfile(
  memories: MemorySignal[],
  recentMessages: RecentMessageSignal[],
): string[] {
  const profile = [
    ...topMemoryTexts(memories, ["preference"], 4),
    ...topMemoryTexts(memories, ["boundary"], 2),
  ];
  const recentUserText = recentMessages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const alias = recentUserText.match(
    /\b(?:my name is|call me|you can call me|please call me)\s+([A-Za-z][A-Za-z0-9 ._-]{1,40})/i,
  )?.[1];

  if (alias) {
    profile.unshift(`User likes to be called ${clipMemory(alias.replace(/[.!?].*$/g, "").trim())}.`);
  }

  if (/\b(?:slow burn|don't rush|do not rush|slower)\b/i.test(recentUserText)) {
    profile.push("User prefers earned pacing over abrupt relationship jumps.");
  }

  return uniqueStrings(profile).slice(0, 6);
}

function deriveSoulProfile(
  memories: MemorySignal[],
  recentMessages: RecentMessageSignal[],
  relationship: RelationshipAnalysis,
): string[] {
  const profile = memories
    .filter((memory) => /^character (?:soul|self-continuity):/i.test(memory.text))
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        right.updated_at.getTime() - left.updated_at.getTime(),
    )
    .slice(0, 4)
    .map((memory) => clipMemory(memory.text));
  const recentAssistantText = recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-8)
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();

  if (relationship.state === "rivalry" || relationship.state === "tense") {
    profile.unshift(
      "Character soul: guarded, skeptical, and responsive to proof rather than instant affection.",
    );
  } else if (relationship.state === "repairing") {
    profile.unshift(
      "Character soul: cautious warmth is emerging, but vulnerability should arrive in small steps.",
    );
  } else if (relationship.state === "romantic" || relationship.state === "intimate") {
    profile.unshift(
      "Character soul: romantic continuity is established in this room; affection should reference shared history instead of resetting.",
    );
  } else if (relationship.state === "friendly") {
    profile.unshift("Character soul: familiar, warmer, and attentive to details the user has earned.");
  }

  if (/\b(?:take it slow|take this slow|one step at a time|not rush)\b/i.test(recentAssistantText)) {
    profile.push("Character soul: chooses slow escalation and explicitly protects pacing.");
  }

  return uniqueStrings(profile).slice(0, 6);
}

function deriveMilestones(
  memories: MemorySignal[],
  recentMessages: RecentMessageSignal[],
  relationship: RelationshipAnalysis,
): string[] {
  const milestones = memories
    .filter((memory) => ["relationship", "event", "canon"].includes(memory.kind))
    .sort(
      (left, right) =>
        right.emotional_weight - left.emotional_weight ||
        right.importance - left.importance ||
        right.updated_at.getTime() - left.updated_at.getTime(),
    )
    .slice(0, 6)
    .map((memory) => clipMemory(memory.text));
  const recentText = recentMessages
    .slice(-10)
    .map((message) => message.content)
    .join("\n");

  if (
    relationship.explicitRomance &&
    /\b(?:i love you too|we're dating|we are dating|i'm your girlfriend|i am your girlfriend|i'm your boyfriend|i am your boyfriend)\b/i.test(
      recentText,
    )
  ) {
    milestones.unshift(
      "Milestone: romantic status was reciprocally established in recent turns.",
    );
  }

  if (
    relationship.explicitConflict &&
    /\b(?:i trust you|forgive|protected|saved you|cared for)\b/i.test(recentText)
  ) {
    milestones.unshift("Milestone: conflict softened through care, repair, or protection.");
  }

  return uniqueStrings(milestones).slice(0, 7);
}

function deriveAdaptiveSkills(
  memories: MemorySignal[],
  recentMessages: RecentMessageSignal[],
  relationship: RelationshipAnalysis,
): string[] {
  const skills: string[] = [];
  const memoryText = memories
    .map((memory) => memory.text)
    .join("\n")
    .toLowerCase();
  const recentText = recentMessages
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();

  if (relationship.state === "rivalry" || relationship.state === "tense") {
    skills.push(
      "Preserve tension and slow-burn trust; a caring turn should create hesitation or curiosity, not instant romance.",
    );
  }

  if (relationship.state === "repairing") {
    skills.push(
      "Show cautious softening through small choices, remembered details, and guarded vulnerability.",
    );
  }

  if (relationship.state === "romantic" || relationship.state === "intimate") {
    skills.push(
      "Keep romance or heat responsive to explicit consent, character rating, tags, and established scene momentum.",
    );
  }

  if (/\b(?:slow burn|don't rush|do not rush|slower)\b/.test(`${memoryText}\n${recentText}`)) {
    skills.push("Keep pacing slow and earned; do not resolve emotional stakes too quickly.");
  }

  if (/\b(?:spicy|sexual|naughty|dominant|submissive)\b/.test(memoryText)) {
    skills.push(
      "Let spicy style signals influence tone only when adult mode and character rating allow it.",
    );
  }

  if (hasRepeatedAssistantBeat(recentMessages)) {
    skills.push(
      "Vary roleplay action beats with scene-specific movement, props, distance, and subtext instead of repeating the same gesture.",
    );
  }

  if (skills.length === 0) {
    skills.push(
      "Track continuity from concrete evidence: names, promises, conflicts, preferences, and unresolved scene beats.",
    );
  }

  return uniqueStrings(skills).slice(0, 5);
}

function deriveOpenLoops(recentMessages: RecentMessageSignal[]): string[] {
  const loops: string[] = [];

  for (const message of recentMessages.slice(-12)) {
    const text = message.content.replace(/\s+/g, " ").trim();

    if (
      /\b(?:promise|promised|next time|tomorrow|after this|when we meet|we still need|don't forget|do not forget)\b/i.test(
        text,
      )
    ) {
      loops.push(clipMemory(text));
    }
  }

  return uniqueStrings(loops).slice(-4);
}

function buildEvolutionSummary(input: {
  stage: EvolutionStage;
  relationshipDepth: number;
  memories: MemorySignal[];
  userMessageCount: number;
  styleProfile: ConversationEvolutionSummary["styleProfile"];
}): string {
  const state = input.styleProfile.relationshipState;

  if (input.memories.length === 0) {
    return `The relationship is ${input.stage} with ${state} continuity. The character should learn from current turns, keep emotional movement gradual, and avoid assuming closeness before it is earned.`;
  }

  const strongest = input.memories
    .slice(0, 5)
    .map((memory) => `${memory.kind}: ${clipMemory(memory.text)}`)
    .join("; ");
  const skillHint = input.styleProfile.adaptiveSkills[0];
  const relationshipHint = input.styleProfile.relationship[0];
  const soulHint = input.styleProfile.soul[0];
  const milestoneHint = input.styleProfile.milestones[0];
  const suffix = [
    skillHint ? `Adaptive habit: ${skillHint}` : "",
    soulHint ? `Soul cue: ${soulHint}` : "",
    milestoneHint ? `Latest milestone: ${milestoneHint}` : "",
    relationshipHint ? `Carry relationship continuity from: ${relationshipHint}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `The relationship is ${input.stage} at depth ${input.relationshipDepth}/100 with ${state} continuity after ${input.userMessageCount} user turns. Most important continuity: ${strongest}.${suffix ? ` ${suffix}` : ""}`;
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
    return emptyStyleProfile();
  }

  const record = value as Record<string, unknown>;

  return {
    preferences: stringArray(record["preferences"]),
    boundaries: stringArray(record["boundaries"]),
    relationship: stringArray(record["relationship"]),
    canon: stringArray(record["canon"]),
    style: stringArray(record["style"]),
    relationshipState:
      typeof record["relationshipState"] === "string"
        ? record["relationshipState"]
        : "unformed/new",
    userProfile: stringArray(record["userProfile"]),
    soul: stringArray(record["soul"]),
    milestones: stringArray(record["milestones"]),
    adaptiveSkills: stringArray(record["adaptiveSkills"]),
    openLoops: stringArray(record["openLoops"]),
    recentSignals: stringArray(record["recentSignals"]),
  };
}

function emptyStyleProfile(): ConversationEvolutionSummary["styleProfile"] {
  return {
    preferences: [],
    boundaries: [],
    relationship: [],
    canon: [],
    style: [],
    relationshipState: "unformed/new",
    userProfile: [],
    soul: [],
    milestones: [],
    adaptiveSkills: [],
    openLoops: [],
    recentSignals: [],
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

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, pattern) => sum + [...text.matchAll(pattern)].length, 0);
}

function hasRepeatedAssistantBeat(recentMessages: RecentMessageSignal[]): boolean {
  const seen = new Map<string, number>();

  for (const message of recentMessages.slice(-16)) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const match of message.content.matchAll(/\*([^*\n]{2,120})\*/g)) {
      const key = (match[1] ?? "")
        .toLowerCase()
        .replace(/\b(?:she|he|they|i|you)\b/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 4)
        .join(" ");

      if (!key) {
        continue;
      }

      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }

  return [...seen.values()].some((count) => count >= 2);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
