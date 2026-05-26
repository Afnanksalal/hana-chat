import type { MemoryKind } from "@hana/contracts";
import { normalizeMemoryText, type SalienceSignals } from "@hana/memory-core";

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

const MAX_CANDIDATES_PER_TURN = 8;

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
  collectStyleSignals(candidates, userText);
  collectAssistantSelfSignals(candidates, assistantText);
  collectAssistantCommitments(candidates, assistantText);

  return dedupeCandidates(candidates)
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        right.emotionalWeight - left.emotionalWeight ||
        right.confidence - left.confidence,
    )
    .slice(0, MAX_CANDIDATES_PER_TURN);
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
    const state = normalized.match(/^relationship state:\s*([^.;]+)/)?.[1] ?? "relationship";
    return `relationship:state:${state}`;
  }

  if (normalized.startsWith("relationship event:")) {
    return `relationship:event:${clipKey(normalized.replace(/^relationship event:\s*/, ""))}`;
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

function relationshipPhrase(value: string): boolean {
  return /\b(?:you|girlfriend|boyfriend|lover|wife|husband|enemy|rival)\b/i.test(value);
}

function romanceIntent(text: string): boolean {
  return /\b(?:i love you|kiss me|be my girlfriend|be my boyfriend|will you be my girlfriend|will you be my boyfriend|date me|let's date|lets date|let's be lovers|lets be lovers|you're my girlfriend|you are my girlfriend|you're my boyfriend|you are my boyfriend|we're dating|we are dating|we're lovers|we are lovers)\b/i.test(
    text,
  );
}

function assistantRomanceAccepted(text: string): boolean {
  return /\b(?:i love you too|i'm your girlfriend|i am your girlfriend|i'm your boyfriend|i am your boyfriend|i'll be your girlfriend|i will be your girlfriend|i'll be your boyfriend|i will be your boyfriend|as your girlfriend|as your boyfriend|we're dating|we are dating|we're together|we are together|we're lovers|we are lovers|my love)\b/i.test(
    text,
  );
}

function assistantRomanceDeferred(text: string): boolean {
  return /\b(?:not yet|too fast|slow down|take it slow|take this slow|not ready|can't be your girlfriend|cannot be your girlfriend|can't be your boyfriend|cannot be your boyfriend|not your girlfriend|not your boyfriend|we aren't dating|we are not dating|we're not dating|let's wait|lets wait)\b/i.test(
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

function clipKey(value: string): string {
  return value.split(" ").slice(0, 14).join(" ");
}
