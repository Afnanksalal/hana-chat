import { describe, expect, it } from "vitest";
import { extractTurnMemoryCandidates, memoryDedupeKey } from "./turn-memory";

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

  it("extracts character self-continuity from assistant behavior", () => {
    const candidates = extractTurnMemoryCandidates({
      userContent: "I helped you, remember?",
      assistantContent:
        "I'm starting to trust you, but I want to take this slow, one step at a time.",
    });

    expect(candidates.some((candidate) => candidate.text.startsWith("Character soul:"))).toBe(
      true,
    );
    expect(
      candidates.some((candidate) => candidate.text.startsWith("Character self-continuity:")),
    ).toBe(true);
  });
});
