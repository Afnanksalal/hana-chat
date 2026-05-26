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
});
