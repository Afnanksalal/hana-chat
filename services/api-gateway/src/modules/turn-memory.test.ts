import { describe, expect, it } from "vitest";
import {
  applyTurnMemoryFeedback,
  extractTurnMemoryCandidates,
  memoryDedupeKey,
  parseTurnMemoryFeedback,
  selectConservativeTurnMemoryFallback,
} from "./turn-memory";

describe("turn memory extraction", () => {
  it("extracts identity, relationship, and pacing signals from a turn", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent:
        "Call me Afnan. We are enemies, but I protected you today. Don't rush this, slow burn please.",
      assistantContent: "I promise I won't forget what you did.",
    });

    expect(candidates.map((candidate) => candidate.kind)).toContain("preference");
    expect(candidates.map((candidate) => candidate.kind)).toContain("relationship");
    expect(candidates.map((candidate) => candidate.kind)).toContain("style");
    expect(candidates.some((candidate) => candidate.text.includes("enemies"))).toBe(true);
    expect(candidates.some((candidate) => candidate.text.includes("protect"))).toBe(true);
  });

  it("uses stable dedupe keys for aliases", () => {
    expect(memoryDedupeKey("preference", "User likes to be called Afnan.")).toBe(
      "preference:user-alias",
    );
    expect(memoryDedupeKey("preference", "User likes to be called Mr Goblin.")).toBe(
      "preference:user-alias",
    );
  });

  it("saves reciprocal romantic status only when the assistant accepts it", () => {
    const accepted = extractTurnMemoryCandidates({
      userContent: "I love you. Will you be my girlfriend?",
      assistantContent: "I love you too. I'm your girlfriend, and we'll take this seriously.",
    });
    const deferred = extractTurnMemoryCandidates({
      userContent: "Be my girlfriend.",
      assistantContent: "Not yet. I care about you, but we should take this slow.",
    });

    expect(accepted.some((candidate) => candidate.text.includes("romantic partnership"))).toBe(
      true,
    );
    expect(deferred.some((candidate) => candidate.text.includes("not established"))).toBe(true);
  });

  it("does not treat pet names as established romantic status", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "Kiss me. Be my girlfriend.",
      assistantContent: "Come closer, my love, but don't rush me into labels yet.",
    });

    expect(candidates.some((candidate) => candidate.text.includes("romantic partnership"))).toBe(
      false,
    );
    expect(candidates.some((candidate) => candidate.text.includes("not established"))).toBe(true);
  });

  it("extracts character self-continuity from assistant behavior", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "I helped you, remember?",
      assistantContent:
        "I'm starting to trust you, but I want to take this slow, one step at a time.",
    });

    expect(candidates.some((candidate) => candidate.text.startsWith("Character soul:"))).toBe(true);
    expect(
      candidates.some((candidate) => candidate.text.startsWith("Character self-continuity:")),
    ).toBe(true);
  });

  it("extracts scene state and roleplay anti-repeat signals", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "We are inside the rain-lit gym after closing.",
      assistantContent:
        "*she tilts her head near the lockers* Stay or go? *she tilts her head again, waiting for your move.*",
    });

    expect(candidates.some((candidate) => candidate.dedupeKey === "scene:state:current")).toBe(
      true,
    );
    expect(candidates.some((candidate) => candidate.text.startsWith("Scene thread:"))).toBe(true);
    expect(candidates.some((candidate) => candidate.text.startsWith("Roleplay habit:"))).toBe(true);
  });

  it("writes a relationship ledger for conflict plus care without making romance automatic", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "We are enemies, but I saved you from the ambush.",
      assistantContent: "*she keeps one hand on the doorframe* I don't trust you yet.",
    });

    expect(candidates.some((candidate) => candidate.text.startsWith("Relationship ledger:"))).toBe(
      true,
    );
    expect(candidates.some((candidate) => candidate.text.includes("romantic partnership"))).toBe(
      false,
    );
  });

  it("lets LLM feedback drop granular or non-personal candidate memories", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "I want corp X would be Y in that test chart.",
      assistantContent: "Sure, I can follow that test setup.",
    });

    expect(candidates.some((candidate) => candidate.text.includes("corp X would be Y"))).toBe(true);

    const reviewed = applyTurnMemoryFeedback(candidates, [
      {
        id: "m1",
        action: "drop",
        reason: "one-off test/hypothetical, not durable personal continuity",
      },
    ]);

    expect(reviewed).toEqual([]);
  });

  it("applies feedback revisions to keep boundaries concise", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "Please don't call me boss anymore.",
      assistantContent: "Understood, I won't use that.",
    });

    const reviewed = applyTurnMemoryFeedback(candidates, [
      {
        id: "m1",
        action: "revise",
        kind: "boundary",
        text: "Boundary: user does not want to be called boss.",
        confidence: 0.9,
        importance: 0.86,
        reason: "stable address boundary",
      },
    ]);

    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]?.kind).toBe("boundary");
    expect(reviewed[0]?.text).toBe("Boundary: user does not want to be called boss.");
  });

  it("parses fenced JSON memory feedback", () => {
    const decisions = parseTurnMemoryFeedback(`\`\`\`json
{"decisions":[{"id":"m1","action":"remember","kind":"preference","text":"User likes concise replies.","confidence":0.8,"importance":0.7,"reason":"stable preference"}]}
\`\`\``);

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.action).toBe("remember");
  });

  it("uses a conservative fallback when feedback is unavailable", () => {
    const noisy = extractTurnMemoryCandidates({
      userContent: "I want corp X would be Y in that test chart.",
      assistantContent: "",
    });
    const alias = extractTurnMemoryCandidates({
      userContent: "Call me Afnan.",
      assistantContent: "",
    });

    expect(selectConservativeTurnMemoryFallback(noisy)).toEqual([]);
    expect(selectConservativeTurnMemoryFallback(alias)).toHaveLength(1);
  });
});
