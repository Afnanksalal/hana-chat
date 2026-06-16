import { describe, expect, it } from "vitest";
import { deriveEvolution } from "./conversation-evolution";

describe("conversation evolution", () => {
  it("keeps enemy-to-trust progression gradual without explicit romance", () => {
    const evolution = deriveEvolution(
      [
        {
          id: "memory-1",
          kind: "relationship",
          text: "Relationship state: the user framed this room as enemies.",
          importance: 0.9,
          emotional_weight: 0.75,
          updated_at: new Date("2026-05-26T00:00:00.000Z"),
        },
        {
          id: "memory-2",
          kind: "event",
          text: "Relationship event: the user described protecting, saving, helping, or caring for the character.",
          importance: 0.76,
          emotional_weight: 0.7,
          updated_at: new Date("2026-05-26T00:01:00.000Z"),
        },
      ],
      6,
      [
        {
          role: "user",
          content: "We are enemies, remember that.",
          created_at: new Date("2026-05-26T00:00:00.000Z"),
        },
        {
          role: "user",
          content: "I cared for you but don't rush this.",
          created_at: new Date("2026-05-26T00:01:00.000Z"),
        },
      ],
    );

    expect(evolution.relationshipDepth).toBeLessThanOrEqual(48);
    expect(evolution.styleProfile.relationshipState).toContain("trust");
    expect(evolution.styleProfile.adaptiveSkills.join(" ")).toContain("slow");
  });

  it("allows explicit romantic state when the conversation actually says it", () => {
    const evolution = deriveEvolution([], 12, [
      {
        role: "user",
        content: "We are dating now and I love you.",
        created_at: new Date("2026-05-26T00:00:00.000Z"),
      },
      {
        role: "assistant",
        content: "*she takes your hand carefully* I love you too, but we keep choosing this.",
        created_at: new Date("2026-05-26T00:01:00.000Z"),
      },
    ]);

    expect(evolution.styleProfile.relationshipState).toMatch(/romantic|intimate/);
    expect(evolution.relationshipDepth).toBeGreaterThan(16);
  });

  it("does not pair romance requests with unrelated later assistant language", () => {
    const evolution = deriveEvolution([], 8, [
      {
        role: "user",
        content: "Be my girlfriend.",
        created_at: new Date("2026-05-26T00:00:00.000Z"),
      },
      {
        role: "assistant",
        content: "*she looks away* Not yet. We need to take this slow.",
        created_at: new Date("2026-05-26T00:01:00.000Z"),
      },
      {
        role: "user",
        content: "Fine. How was your day?",
        created_at: new Date("2026-05-26T00:02:00.000Z"),
      },
      {
        role: "assistant",
        content: "*she exhales* Better than yesterday, my love.",
        created_at: new Date("2026-05-26T00:03:00.000Z"),
      },
    ]);

    expect(evolution.styleProfile.relationshipState).not.toMatch(/romantic|intimate/);
  });

  it("does not promote a dense first turn straight to attuned", () => {
    const memories = Array.from({ length: 8 }, (_, index) => ({
      id: `memory-${index}`,
      kind: index % 2 === 0 ? "relationship" : "event",
      text:
        index === 0
          ? "Relationship state: the user framed this room as enemies."
          : `Relationship event: important early scene anchor ${index}.`,
      importance: 0.92,
      emotional_weight: 0.78,
      updated_at: new Date(`2026-05-26T00:0${index}:00.000Z`),
    }));
    const evolution = deriveEvolution(memories, 1, [
      {
        role: "user",
        content: "We are enemies, but I saved you.",
        created_at: new Date("2026-05-26T00:00:00.000Z"),
      },
    ]);

    expect(evolution.stage).toBe("new");
  });

  it("keeps reciprocal romantic memory alive after later non-romantic turns", () => {
    const evolution = deriveEvolution(
      [
        {
          id: "memory-romance",
          kind: "relationship",
          text: "Relationship state: the user and character explicitly established a romantic partnership in this room.",
          importance: 0.92,
          emotional_weight: 0.78,
          updated_at: new Date("2026-05-26T00:02:00.000Z"),
        },
        {
          id: "memory-soul",
          kind: "relationship",
          text: "Character soul: romantic continuity is established in this room; affection should reference shared history instead of resetting.",
          importance: 0.84,
          emotional_weight: 0.66,
          updated_at: new Date("2026-05-26T00:03:00.000Z"),
        },
      ],
      18,
      [
        {
          role: "user",
          content: "How was your day?",
          created_at: new Date("2026-05-26T00:04:00.000Z"),
        },
        {
          role: "assistant",
          content: "*she squeezes your hand* Better now that you're here.",
          created_at: new Date("2026-05-26T00:05:00.000Z"),
        },
      ],
    );

    expect(evolution.styleProfile.relationshipState).toMatch(/romantic|intimate/);
    expect(evolution.styleProfile.soul.join(" ")).toContain("romantic continuity");
    expect(evolution.styleProfile.milestones.join(" ")).toContain("romantic partnership");
  });

  it("keeps scene state and relationship ledger in the prompt-facing profile", () => {
    const evolution = deriveEvolution(
      [
        {
          id: "memory-scene",
          kind: "event",
          text: "Scene state: latest assistant beat: she stands by the cracked mirror. Continue from this visible moment instead of resetting the pose.",
          importance: 0.82,
          emotional_weight: 0.48,
          updated_at: new Date("2026-05-26T00:02:00.000Z"),
        },
        {
          id: "memory-ledger",
          kind: "relationship",
          text: "Relationship ledger: distrust or rivalry is active and must not be overwritten by quick affection.",
          importance: 0.82,
          emotional_weight: 0.72,
          updated_at: new Date("2026-05-26T00:03:00.000Z"),
        },
      ],
      4,
      [
        {
          role: "assistant",
          content: "*she stands by the cracked mirror, not turning around yet.* Your move.",
          created_at: new Date("2026-05-26T00:04:00.000Z"),
        },
      ],
    );

    expect(evolution.styleProfile.sceneState.join(" ")).toContain("cracked mirror");
    expect(evolution.styleProfile.relationshipLedger.join(" ")).toContain("distrust");
    expect(evolution.summary).toContain("Scene state");
  });
});
