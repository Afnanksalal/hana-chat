import type { MemoryKind } from "@hana/contracts";
import { normalizeMemoryText, type SalienceSignals } from "@hana/memory-core";
import { z } from "zod";

export type ConversationalMemoryKind = Exclude<MemoryKind, "safety" | "system">;

export interface TurnMemoryCandidate {
  kind: ConversationalMemoryKind;
  text: string;
  confidence: number;
  importance: number;
  emotionalWeight: number;
  salience: SalienceSignals;
  dedupeKey: string;
}

export interface ExistingTurnMemory {
  kind: string;
  text: string;
}

export type TurnMemoryFeedbackAction = "remember" | "revise" | "drop";

export interface TurnMemoryFeedbackDecision {
  id: string;
  action: TurnMemoryFeedbackAction;
  kind?: ConversationalMemoryKind;
  text?: string;
  confidence?: number;
  importance?: number;
  reason?: string;
}

const MAX_CANDIDATES_PER_TURN = 7;
const TURN_MEMORY_FEEDBACK_KINDS = [
  "preference",
  "boundary",
  "relationship",
  "canon",
  "event",
  "style",
] as const;
const TURN_MEMORY_REVIEW_MIN_CONFIDENCE = 0.52;
const TURN_MEMORY_REVIEW_MIN_IMPORTANCE = 0.54;

const TurnMemoryFeedbackPayloadSchema = z.object({
  decisions: z
    .array(
      z.object({
        id: z.string().min(2).max(12),
        action: z.enum(["remember", "revise", "drop"]),
        kind: z.enum(TURN_MEMORY_FEEDBACK_KINDS).optional(),
        text: z.string().min(1).max(360).optional(),
        confidence: z.number().min(0).max(1).optional(),
        importance: z.number().min(0).max(1).optional(),
        reason: z.string().max(240).optional(),
      }),
    )
    .max(MAX_CANDIDATES_PER_TURN),
});

export function extractTurnMemoryCandidates(input: {
  userContent: string;
  assistantContent?: string;
}): TurnMemoryCandidate[] {
  const candidates: TurnMemoryCandidate[] = [];
  const userText = compactText(input.userContent);
  const assistantText = compactText(input.assistantContent ?? "");

  collectUserIdentity(candidates, userText);
  collectPreferenceAndBoundaries(candidates, userText);
  collectRelationshipSignals(candidates, userText, assistantText);
  collectCanonAndEvents(candidates, userText);
  collectSceneContinuity(candidates, userText, assistantText);
  collectStyleSignals(candidates, userText);
  collectAssistantSelfSignals(candidates, assistantText);
  collectAssistantCommitments(candidates, assistantText);

  return selectTurnMemoryCandidates(dedupeCandidates(candidates));
}

export function buildTurnMemoryFeedbackMessages(input: {
  userContent: string;
  assistantContent: string;
  candidates: TurnMemoryCandidate[];
  existingMemories?: ExistingTurnMemory[];
}): Array<{ role: "system" | "user"; content: string }> {
  const candidates = input.candidates.slice(0, MAX_CANDIDATES_PER_TURN).map((candidate, index) => ({
    id: turnMemoryFeedbackId(index),
    kind: candidate.kind,
    text: candidate.text,
    confidence: roundScore(candidate.confidence),
    importance: roundScore(candidate.importance),
    emotionalWeight: roundScore(candidate.emotionalWeight),
  }));
  const existing = (input.existingMemories ?? [])
    .slice(0, 18)
    .map((memory, index) => `${index + 1}. ${memory.kind}: ${clipForPrompt(memory.text, 220)}`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        "You review proposed long-term memories for an AI companion roleplay chat.",
        "Your job is curation, not extraction: only approve, revise, or drop the provided candidates.",
        "Save a memory only when it will likely improve future continuity in this same user-character-room.",
        "Durable memories include stable user identity, stable preferences, real boundaries, explicit remember requests, relationship state/events with clear evidence, current scene state needed to resume, recurring roleplay style feedback, or a character self/soul cue the assistant actually established.",
        "Drop one-off hypotheticals, trivia, business/world claims, predictions, tests, temporary commands, accidental fragments, and generic statements that are not about the user's personal continuity, the character relationship, or the current scene.",
        "For examples like 'corp X would be Y', drop unless the user explicitly framed it as roleplay canon that must persist.",
        "For boundaries, remember user safety/style/relationship boundaries; drop ordinary in-scene negations that only apply to the immediate action.",
        "For preferences, remember stable personal preferences; drop a one-turn desire unless repeated, explicit, or relationship-defining.",
        "If the memory would feel surprising, creepy, or useless if recalled later, drop it.",
        'Return JSON only with this shape: {"decisions":[{"id":"m1","action":"remember|revise|drop","kind":"preference|boundary|relationship|canon|event|style","text":"concise memory text","confidence":0.0,"importance":0.0,"reason":"short reason"}]}',
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          currentTurn: {
            user: clipForPrompt(input.userContent, 1_200),
            assistant: clipForPrompt(input.assistantContent, 1_200),
          },
          existingMemories: existing || "none",
          candidates,
          decisionRules: [
            "Use action=drop for candidates that are too granular or not durable.",
            "Use action=revise when the idea is worth keeping but the text should be shorter, less creepy, or more precise.",
            "Do not add new candidate ids. Do not create memories from facts that were not proposed.",
            "When remembering, keep text under 260 characters and preserve useful prefixes like Boundary:, Relationship state:, Scene state:, or Style preference:.",
          ],
        },
        null,
        2,
      ),
    },
  ];
}

export function parseTurnMemoryFeedback(raw: string): TurnMemoryFeedbackDecision[] {
  const json = extractJsonObject(raw);

  if (!json) {
    return [];
  }

  try {
    const parsed = TurnMemoryFeedbackPayloadSchema.safeParse(JSON.parse(json));

    if (!parsed.success) {
      return [];
    }

    return parsed.data.decisions
      .filter((decision) => /^m\d+$/.test(decision.id))
      .map((decision) => ({
        id: decision.id,
        action: decision.action,
        ...(decision.kind ? { kind: decision.kind } : {}),
        ...(decision.text ? { text: decision.text } : {}),
        ...(typeof decision.confidence === "number" ? { confidence: decision.confidence } : {}),
        ...(typeof decision.importance === "number" ? { importance: decision.importance } : {}),
        ...(decision.reason ? { reason: decision.reason } : {}),
      }));
  } catch {
    return [];
  }
}

export function applyTurnMemoryFeedback(
  candidates: TurnMemoryCandidate[],
  decisions: TurnMemoryFeedbackDecision[],
): TurnMemoryCandidate[] {
  if (candidates.length === 0 || decisions.length === 0) {
    return [];
  }

  const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
  const reviewed: TurnMemoryCandidate[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const decision = decisionById.get(turnMemoryFeedbackId(index));

    if (!decision || decision.action === "drop") {
      continue;
    }

    const confidence = clampScore(decision.confidence ?? candidate.confidence);
    const importance = clampScore(decision.importance ?? candidate.importance);

    if (
      confidence < TURN_MEMORY_REVIEW_MIN_CONFIDENCE ||
      importance < TURN_MEMORY_REVIEW_MIN_IMPORTANCE
    ) {
      continue;
    }

    const kind = decision.kind ?? candidate.kind;
    const reviewedText =
      decision.action === "revise" && decision.text
        ? clipMemorySentence(decision.text)
        : decision.action === "remember" && decision.text
          ? clipMemorySentence(decision.text)
          : candidate.text;

    if (reviewedText.length < 12) {
      continue;
    }

    reviewed.push({
      ...candidate,
      kind,
      text: reviewedText,
      confidence: Math.max(candidate.confidence, confidence),
      importance: Math.max(candidate.importance, importance),
      dedupeKey: memoryDedupeKey(kind, reviewedText),
    });
  }

  return selectTurnMemoryCandidates(dedupeCandidates(reviewed));
}

export function selectConservativeTurnMemoryFallback(
  candidates: TurnMemoryCandidate[],
): TurnMemoryCandidate[] {
  return selectTurnMemoryCandidates(
    candidates.filter(
      (candidate) =>
        candidate.dedupeKey === "preference:user-alias" ||
        candidate.dedupeKey === "relationship:state:current" ||
        candidate.dedupeKey === "scene:state:current" ||
        candidate.importance >= 0.82,
    ),
  );
}

export function memoryDedupeKey(kind: string, text: string): string {
  const normalized = normalizeMemoryText(text)
    .replace(/[^\p{L}\p{N}\s:-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.startsWith("user likes to be called ")) {
    return "preference:user-alias";
  }

  if (normalized.startsWith("relationship state:")) {
    return "relationship:state:current";
  }

  if (normalized.startsWith("relationship event:")) {
    return `relationship:event:${clipKey(normalized.replace(/^relationship event:\s*/, ""))}`;
  }

  if (normalized.startsWith("relationship ledger:")) {
    return `relationship:ledger:${clipKey(normalized.replace(/^relationship ledger:\s*/, ""))}`;
  }

  if (normalized.startsWith("scene state:")) {
    return "scene:state:current";
  }

  if (normalized.startsWith("scene thread:")) {
    return `scene:thread:${clipKey(normalized.replace(/^scene thread:\s*/, ""))}`;
  }

  if (normalized.startsWith("roleplay habit:")) {
    return `roleplay:habit:${clipKey(normalized.replace(/^roleplay habit:\s*/, ""))}`;
  }

  if (normalized.startsWith("character soul:")) {
    return `character:soul:${clipKey(normalized.replace(/^character soul:\s*/, ""))}`;
  }

  if (normalized.startsWith("character self-continuity:")) {
    return `character:self:${clipKey(normalized.replace(/^character self-continuity:\s*/, ""))}`;
  }

  if (normalized.startsWith("boundary:")) {
    return `boundary:${clipKey(normalized.replace(/^boundary:\s*/, ""))}`;
  }

  if (normalized.startsWith("style preference:")) {
    return `style:${clipKey(normalized.replace(/^style preference:\s*/, ""))}`;
  }

  return `${kind}:${clipKey(normalized)}`;
}

function collectUserIdentity(candidates: TurnMemoryCandidate[], text: string): void {
  const alias = cleanAlias(
    text.match(
      /\b(?:my name is|call me|you can call me|please call me)\s+([A-Za-z][A-Za-z0-9 ._-]{1,40})/i,
    )?.[1] ?? "",
  );

  if (!alias) {
    return;
  }

  addCandidate(candidates, {
    kind: "preference",
    text: `User likes to be called ${alias}.`,
    confidence: 0.95,
    importance: 0.88,
    emotionalWeight: 0.35,
    salience: {
      explicitMemorySignal: 1,
      emotionalIntensity: 0.35,
      recurrenceSignal: 0.3,
      relationshipImpact: 0.65,
      preferenceOrBoundarySignal: 1,
      novelty: 0.85,
    },
  });
}

function collectPreferenceAndBoundaries(candidates: TurnMemoryCandidate[], text: string): void {
  for (const match of text.matchAll(
    /\bI\s+(?:really\s+|just\s+)?(?:prefer|like|love|enjoy|want)\s+([^.!?\n]{3,140})/gi,
  )) {
    const phrase = cleanFragment(match[1] ?? "");

    if (!phrase || relationshipPhrase(phrase)) {
      continue;
    }

    addCandidate(candidates, {
      kind: "preference",
      text: `User prefers ${phrase}.`,
      confidence: 0.82,
      importance: 0.68,
      emotionalWeight: 0.3,
      salience: defaultSalience({
        explicitMemorySignal: 0.75,
        preferenceOrBoundarySignal: 0.9,
        relationshipImpact: 0.35,
      }),
    });
  }

  for (const match of text.matchAll(
    /\bI\s+(?:hate|dislike|don't like|do not like|can't stand)\s+([^.!?\n]{3,140})/gi,
  )) {
    const phrase = cleanFragment(match[1] ?? "");

    if (!phrase) {
      continue;
    }

    addCandidate(candidates, {
      kind: "preference",
      text: `User dislikes ${phrase}.`,
      confidence: 0.82,
      importance: 0.7,
      emotionalWeight: 0.4,
      salience: defaultSalience({
        explicitMemorySignal: 0.75,
        emotionalIntensity: 0.45,
        preferenceOrBoundarySignal: 0.9,
      }),
    });
  }

  for (const match of text.matchAll(
    /\b(?:don't|do not|never|stop|please don't|please do not)\s+([^.!?\n]{3,150})/gi,
  )) {
    const phrase = cleanFragment(match[1] ?? "");

    if (!phrase) {
      continue;
    }

    addCandidate(candidates, {
      kind: "boundary",
      text: `Boundary: user asked not to ${phrase}.`,
      confidence: 0.86,
      importance: 0.82,
      emotionalWeight: 0.5,
      salience: defaultSalience({
        explicitMemorySignal: 0.85,
        emotionalIntensity: 0.5,
        preferenceOrBoundarySignal: 1,
        relationshipImpact: 0.5,
      }),
    });
  }
}

function collectRelationshipSignals(
  candidates: TurnMemoryCandidate[],
  text: string,
  assistantText: string,
): void {
  const lower = text.toLowerCase();
  const explicitState = lower.match(
    /\b(?:we\s+(?:are|were|used to be)|we're|our relationship is|this is)\s+(enemies|rivals|strangers|friends|best friends|lovers|partners|dating|girlfriend|boyfriend|married)\b/,
  )?.[1];

  if (explicitState) {
    addCandidate(candidates, {
      kind: "relationship",
      text: `Relationship state: the user framed this room as ${explicitState}.`,
      confidence: 0.9,
      importance: 0.88,
      emotionalWeight: relationshipHeat(explicitState),
      salience: defaultSalience({
        explicitMemorySignal: 0.95,
        emotionalIntensity: relationshipHeat(explicitState),
        relationshipImpact: 1,
        preferenceOrBoundarySignal: 0.35,
      }),
    });
  }

  if (
    /\b(?:i don't trust you|i do not trust you|i hate you|you betrayed me|enemy|rival)\b/i.test(
      text,
    )
  ) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship state: tension or distrust is active; warmth should be earned gradually.",
      confidence: 0.84,
      importance: 0.84,
      emotionalWeight: 0.76,
      salience: defaultSalience({
        explicitMemorySignal: 0.78,
        emotionalIntensity: 0.78,
        relationshipImpact: 1,
        preferenceOrBoundarySignal: 0.25,
      }),
    });
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship ledger: distrust or rivalry is active and must not be overwritten by quick affection.",
      confidence: 0.82,
      importance: 0.82,
      emotionalWeight: 0.72,
      salience: defaultSalience({
        explicitMemorySignal: 0.72,
        emotionalIntensity: 0.72,
        relationshipImpact: 0.95,
        preferenceOrBoundarySignal: 0.25,
      }),
    });
  }

  if (
    /\b(?:i trust you|i forgive you|i'm sorry|i am sorry|thank you for|i cared for you)\b/i.test(
      text,
    )
  ) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship event: the user offered trust, repair, gratitude, or care in this room.",
      confidence: 0.8,
      importance: 0.74,
      emotionalWeight: 0.66,
      salience: defaultSalience({
        explicitMemorySignal: 0.65,
        emotionalIntensity: 0.62,
        relationshipImpact: 0.9,
        preferenceOrBoundarySignal: 0.25,
      }),
    });
  }

  if (
    romanceIntent(text) &&
    assistantRomanceAccepted(assistantText) &&
    !assistantRomanceDeferred(assistantText)
  ) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship state: the user and character explicitly established a romantic partnership in this room.",
      confidence: 0.9,
      importance: 0.92,
      emotionalWeight: 0.78,
      salience: defaultSalience({
        explicitMemorySignal: 0.92,
        emotionalIntensity: 0.78,
        relationshipImpact: 1,
        preferenceOrBoundarySignal: 0.3,
      }),
    });
  } else if (romanceIntent(text) && assistantRomanceDeferred(assistantText)) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship state: romantic escalation was requested but not established; keep pacing cautious and consent-led.",
      confidence: 0.88,
      importance: 0.86,
      emotionalWeight: 0.68,
      salience: defaultSalience({
        explicitMemorySignal: 0.88,
        emotionalIntensity: 0.68,
        relationshipImpact: 0.95,
        preferenceOrBoundarySignal: 0.35,
      }),
    });
  } else if (romanceIntent(text)) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship event: the user requested romantic or intimate escalation; do not treat it as established unless the character clearly reciprocates.",
      confidence: 0.78,
      importance: 0.76,
      emotionalWeight: 0.68,
      salience: defaultSalience({
        explicitMemorySignal: 0.74,
        emotionalIntensity: 0.68,
        relationshipImpact: 0.86,
        preferenceOrBoundarySignal: 0.3,
      }),
    });
  }

  if (
    /\b(?:i protected you|i saved you|i helped you|i took care of you|i defended you)\b/i.test(text)
  ) {
    addCandidate(candidates, {
      kind: "event",
      text: "Relationship event: the user described protecting, saving, helping, or caring for the character.",
      confidence: 0.82,
      importance: 0.84,
      emotionalWeight: 0.7,
      salience: defaultSalience({
        explicitMemorySignal: 0.65,
        emotionalIntensity: 0.7,
        relationshipImpact: 0.85,
        preferenceOrBoundarySignal: 0.2,
      }),
    });
    addCandidate(candidates, {
      kind: "relationship",
      text: "Relationship ledger: the user offered concrete care or protection, which can soften the bond without erasing prior conflict.",
      confidence: 0.78,
      importance: 0.78,
      emotionalWeight: 0.68,
      salience: defaultSalience({
        explicitMemorySignal: 0.6,
        emotionalIntensity: 0.68,
        relationshipImpact: 0.88,
        preferenceOrBoundarySignal: 0.2,
      }),
    });
  }
}

function collectAssistantSelfSignals(candidates: TurnMemoryCandidate[], text: string): void {
  if (!text) {
    return;
  }

  if (
    /\b(?:i don't trust you|i do not trust you|not sure i trust|keep my guard up|still wary|still scared|not ready to trust)\b/i.test(
      text,
    )
  ) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Character soul: the character is guarded and needs trust to be rebuilt through consistent actions.",
      confidence: 0.76,
      importance: 0.78,
      emotionalWeight: 0.66,
      salience: defaultSalience({
        explicitMemorySignal: 0.52,
        emotionalIntensity: 0.68,
        relationshipImpact: 0.88,
        preferenceOrBoundarySignal: 0.2,
      }),
    });
  }

  if (
    /\b(?:i trust you|i'm starting to trust you|i am starting to trust you|i feel safe with you|you make me feel safe)\b/i.test(
      text,
    )
  ) {
    addCandidate(candidates, {
      kind: "relationship",
      text: "Character soul: trust is growing, but it should be protected through continuity and earned emotional pacing.",
      confidence: 0.76,
      importance: 0.78,
      emotionalWeight: 0.66,
      salience: defaultSalience({
        explicitMemorySignal: 0.52,
        emotionalIntensity: 0.66,
        relationshipImpact: 0.9,
        preferenceOrBoundarySignal: 0.2,
      }),
    });
  }

  if (/\b(?:one step at a time|take this slow|take it slow|slowly|not rush)\b/i.test(text)) {
    addCandidate(candidates, {
      kind: "style",
      text: "Character self-continuity: the character chose slow pacing and gradual emotional escalation.",
      confidence: 0.72,
      importance: 0.68,
      emotionalWeight: 0.46,
      salience: defaultSalience({
        explicitMemorySignal: 0.48,
        emotionalIntensity: 0.45,
        relationshipImpact: 0.7,
        preferenceOrBoundarySignal: 0.62,
      }),
    });
  }
}

function collectCanonAndEvents(candidates: TurnMemoryCandidate[], text: string): void {
  for (const match of text.matchAll(/\bremember(?: that)?\s+([^.!?\n]{4,180})/gi)) {
    const phrase = cleanFragment(match[1] ?? "");

    if (!phrase) {
      continue;
    }

    addCandidate(candidates, {
      kind: "canon",
      text: `Shared canon: ${capitalizeSentence(phrase)}.`,
      confidence: 0.88,
      importance: 0.82,
      emotionalWeight: 0.45,
      salience: defaultSalience({
        explicitMemorySignal: 1,
        relationshipImpact: 0.55,
        preferenceOrBoundarySignal: 0.35,
      }),
    });
  }

  if (
    /\b(?:we met|we fought|we argued|we escaped|we kissed|we promised|you promised|i promised|you betrayed me|i betrayed you)\b/i.test(
      text,
    )
  ) {
    addCandidate(candidates, {
      kind: "event",
      text: `Shared event: ${clipMemorySentence(text)}.`,
      confidence: 0.76,
      importance: 0.72,
      emotionalWeight: 0.58,
      salience: defaultSalience({
        explicitMemorySignal: 0.6,
        emotionalIntensity: 0.58,
        relationshipImpact: 0.72,
        preferenceOrBoundarySignal: 0.2,
      }),
    });
  }
}

function collectStyleSignals(candidates: TurnMemoryCandidate[], text: string): void {
  const styleTriggers = [
    "slow burn",
    "slower",
    "don't rush",
    "do not rush",
    "more detailed",
    "less detailed",
    "more romantic",
    "more teasing",
    "more spicy",
    "more sexual",
    "more dominant",
    "more submissive",
    "stay in character",
    "use italics",
    "less emojis",
    "no emojis",
  ];
  const lower = text.toLowerCase();
  const matched = styleTriggers.find((trigger) => lower.includes(trigger));

  if (!matched) {
    return;
  }

  addCandidate(candidates, {
    kind: "style",
    text: `Style preference: user asked for ${matched} pacing or tone.`,
    confidence: 0.8,
    importance: 0.76,
    emotionalWeight: 0.35,
    salience: defaultSalience({
      explicitMemorySignal: 0.72,
      recurrenceSignal: 0.45,
      relationshipImpact: 0.45,
      preferenceOrBoundarySignal: 0.85,
    }),
  });
}

function collectSceneContinuity(
  candidates: TurnMemoryCandidate[],
  userText: string,
  assistantText: string,
): void {
  const userScene = userText.match(
    /\b(?:we are|we're|i am|i'm|you are|you're)\s+(in|at|inside|outside|on|near)\s+([^.!?\n]{3,110})/i,
  );
  const latestAssistantBeat = latestItalicBeat(assistantText);
  const scenePieces: string[] = [];

  if (userScene?.[1] && userScene[2]) {
    scenePieces.push(
      `location/context from user: ${cleanFragment(`${userScene[1]} ${userScene[2]}`)}`,
    );
  }

  if (latestAssistantBeat) {
    scenePieces.push(`latest assistant beat: ${latestAssistantBeat}`);
  }

  if (scenePieces.length > 0) {
    addCandidate(candidates, {
      kind: "event",
      text: `Scene state: ${scenePieces.join("; ")}. Continue from this visible moment instead of resetting the pose.`,
      confidence: 0.78,
      importance: 0.82,
      emotionalWeight: 0.48,
      salience: defaultSalience({
        explicitMemorySignal: userScene ? 0.72 : 0.45,
        emotionalIntensity: 0.45,
        recurrenceSignal: 0.5,
        relationshipImpact: 0.58,
        preferenceOrBoundarySignal: 0.25,
        novelty: 0.8,
      }),
    });
  }

  if (
    /\b(?:what do you do|what will you do|choose|your move|tell me|will you|do you follow|do you stay|come with me|next)\b/i.test(
      assistantText,
    )
  ) {
    addCandidate(candidates, {
      kind: "event",
      text: `Scene thread: ${clipMemorySentence(assistantText)}`,
      confidence: 0.62,
      importance: 0.58,
      emotionalWeight: 0.38,
      salience: defaultSalience({
        explicitMemorySignal: 0.35,
        emotionalIntensity: 0.35,
        recurrenceSignal: 0.45,
        relationshipImpact: 0.42,
        novelty: 0.55,
      }),
    });
  }

  const repeatedMotif = repeatedActionMotif(assistantText);

  if (repeatedMotif) {
    addCandidate(candidates, {
      kind: "style",
      text: `Roleplay habit: avoid repeating ${repeatedMotif}; vary action beats through scene-specific movement, props, distance, and subtext.`,
      confidence: 0.68,
      importance: 0.68,
      emotionalWeight: 0.32,
      salience: defaultSalience({
        explicitMemorySignal: 0.36,
        recurrenceSignal: 0.82,
        relationshipImpact: 0.45,
        preferenceOrBoundarySignal: 0.7,
        novelty: 0.45,
      }),
    });
  }
}

function collectAssistantCommitments(candidates: TurnMemoryCandidate[], text: string): void {
  if (!text || !/\b(?:i promise|i won't forget|i will remember|i'll remember)\b/i.test(text)) {
    return;
  }

  addCandidate(candidates, {
    kind: "event",
    text: `Character commitment: ${clipMemorySentence(text)}.`,
    confidence: 0.68,
    importance: 0.58,
    emotionalWeight: 0.4,
    salience: defaultSalience({
      explicitMemorySignal: 0.45,
      emotionalIntensity: 0.35,
      relationshipImpact: 0.55,
      preferenceOrBoundarySignal: 0.15,
      novelty: 0.45,
    }),
  });
}

function addCandidate(
  candidates: TurnMemoryCandidate[],
  candidate: Omit<TurnMemoryCandidate, "dedupeKey">,
): void {
  const text = clipMemorySentence(candidate.text);

  if (text.length < 12) {
    return;
  }

  candidates.push({
    ...candidate,
    text,
    dedupeKey: memoryDedupeKey(candidate.kind, text),
  });
}

function dedupeCandidates(candidates: TurnMemoryCandidate[]): TurnMemoryCandidate[] {
  const byKey = new Map<string, TurnMemoryCandidate>();

  for (const candidate of candidates) {
    const current = byKey.get(candidate.dedupeKey);

    if (!current || candidate.importance > current.importance) {
      byKey.set(candidate.dedupeKey, candidate);
    }
  }

  return [...byKey.values()];
}

function selectTurnMemoryCandidates(candidates: TurnMemoryCandidate[]): TurnMemoryCandidate[] {
  const sorted = [...candidates].sort(
    (left, right) =>
      right.importance - left.importance ||
      right.emotionalWeight - left.emotionalWeight ||
      right.confidence - left.confidence,
  );
  const selected: TurnMemoryCandidate[] = [];
  let relationshipStateCount = 0;
  let relationshipOtherCount = 0;
  let episodicCount = 0;
  let sceneStateCount = 0;

  for (const candidate of sorted) {
    const isRelationshipState = candidate.dedupeKey === "relationship:state:current";
    const isSceneState = candidate.dedupeKey === "scene:state:current";

    if (isRelationshipState && relationshipStateCount >= 1) {
      continue;
    }

    if (isSceneState && sceneStateCount >= 1) {
      continue;
    }

    if (candidate.kind === "relationship" && !isRelationshipState && relationshipOtherCount >= 2) {
      continue;
    }

    if (
      (candidate.kind === "event" || candidate.kind === "canon") &&
      !isSceneState &&
      episodicCount >= 3
    ) {
      continue;
    }

    selected.push(candidate);

    if (isRelationshipState) {
      relationshipStateCount += 1;
    } else if (isSceneState) {
      sceneStateCount += 1;
    } else if (candidate.kind === "relationship") {
      relationshipOtherCount += 1;
    } else if (candidate.kind === "event" || candidate.kind === "canon") {
      episodicCount += 1;
    }

    if (selected.length >= MAX_CANDIDATES_PER_TURN) {
      break;
    }
  }

  return selected;
}

function defaultSalience(overrides: Partial<SalienceSignals>): SalienceSignals {
  return {
    explicitMemorySignal: 0.45,
    emotionalIntensity: 0.35,
    recurrenceSignal: 0.25,
    relationshipImpact: 0.45,
    preferenceOrBoundarySignal: 0.35,
    novelty: 0.7,
    ...overrides,
  };
}

function cleanFragment(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^that\s+/i, "")
    .replace(/[,.!?;:]+$/g, "")
    .trim();
}

function cleanAlias(value: string): string {
  const compact = cleanFragment(value);
  const [alias] = compact.split(/[!?]\s|\.\s+(?=[A-Z])|\s+(?:we|but|because)\b/i);

  return cleanFragment(alias ?? "");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function latestItalicBeat(text: string): string | null {
  const beats = [...text.matchAll(/\*([^*\n]{3,180})\*/g)]
    .map((match) => cleanFragment(match[1] ?? ""))
    .filter(Boolean);

  return beats.at(-1) ?? null;
}

function repeatedActionMotif(text: string): string | null {
  const beats = [...text.matchAll(/\*([^*\n]{3,180})\*/g)].map((match) =>
    (match[1] ?? "").toLowerCase(),
  );
  const motifs = beats.map(actionMotif).filter((motif): motif is string => Boolean(motif));
  const counts = new Map<string, number>();

  for (const motif of motifs) {
    counts.set(motif, (counts.get(motif) ?? 0) + 1);
  }

  return [...counts.entries()].find(([, count]) => count >= 2)?.[0] ?? null;
}

function actionMotif(beat: string): string | null {
  const normalized = beat
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  if (/\b(?:mirror|window|reflection|glass)\b/.test(normalized)) {
    return "mirror/window/reflection gaze";
  }

  if (/\btilt(?:s|ed|ing)?\b.*\bhead\b|\bhead\b.*\btilt/.test(normalized)) {
    return "head tilt";
  }

  if (/\b(?:smile|smiles|smiling|grin|grins)\b/.test(normalized)) {
    return "smile/grin";
  }

  if (/\b(?:lean|leans|leaned|leaning)\b/.test(normalized)) {
    return "leaning";
  }

  if (/\b(?:look|looks|gaze|gazes|stare|stares|studies|watches)\b/.test(normalized)) {
    return "looking/gazing";
  }

  if (/\b(?:hand|hands|finger|fingers|touch|touches|brush|brushes)\b/.test(normalized)) {
    return "hand/touch";
  }

  return null;
}

function relationshipPhrase(value: string): boolean {
  return /\b(?:you|girlfriend|boyfriend|lover|wife|husband|enemy|rival)\b/i.test(value);
}

function romanceIntent(text: string): boolean {
  return /\b(?:i love you|kiss me|be my girlfriend|be my boyfriend|will you be my girlfriend|will you be my boyfriend|date me|let's date|lets date|let's be lovers|lets be lovers|you're my girlfriend|you are my girlfriend|you're my boyfriend|you are my boyfriend|we're dating|we are dating|we're lovers|we are lovers)\b/i.test(
    text,
  );
}

function assistantRomanceAccepted(text: string): boolean {
  return /\b(?:i love you too|i'm your girlfriend|i am your girlfriend|i'm your boyfriend|i am your boyfriend|i'll be your girlfriend|i will be your girlfriend|i'll be your boyfriend|i will be your boyfriend|as your girlfriend|as your boyfriend|we're dating|we are dating|we're together|we are together|we're lovers|we are lovers)\b/i.test(
    text,
  );
}

function assistantRomanceDeferred(text: string): boolean {
  return /\b(?:not yet|too fast|slow down|don't rush|do not rush|rush me into labels|take it slow|take this slow|not ready|can't be your girlfriend|cannot be your girlfriend|can't be your boyfriend|cannot be your boyfriend|not your girlfriend|not your boyfriend|we aren't dating|we are not dating|we're not dating|let's wait|lets wait)\b/i.test(
    text,
  );
}

function relationshipHeat(state: string): number {
  if (/enemies|rivals|strangers/i.test(state)) {
    return 0.78;
  }

  if (/lovers|partners|dating|girlfriend|boyfriend|married/i.test(state)) {
    return 0.72;
  }

  return 0.55;
}

function capitalizeSentence(value: string): string {
  const trimmed = cleanFragment(value);

  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : trimmed;
}

function clipMemorySentence(value: string): string {
  const compact = compactText(value).replace(/\s+([,.!?;:])/g, "$1");
  const clipped =
    compact.length <= 280 ? compact : `${compact.slice(0, 264).trimEnd()} [truncated]`;

  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

function clipForPrompt(value: string, maxLength: number): string {
  const compact = compactText(value);

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 15)} [truncated]`;
}

function clipKey(value: string): string {
  return value.split(" ").slice(0, 14).join(" ");
}

function turnMemoryFeedbackId(index: number): string {
  return `m${index + 1}`;
}

function extractJsonObject(raw: string): string | null {
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  return unfenced.slice(start, end + 1);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clampScore(value) * 100) / 100;
}
