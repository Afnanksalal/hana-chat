import { describe, expect, it } from "vitest";
import { memoryWriteAction, recencyDecay, scoreRetrieval, scoreSalience } from "./index";

describe("memory scoring", () => {
  it("promotes high-salience turns to immediate memory writes", () => {
    const score = scoreSalience({
      explicitMemorySignal: 1,
      emotionalIntensity: 0.8,
      recurrenceSignal: 0.7,
      relationshipImpact: 0.8,
      preferenceOrBoundarySignal: 1,
      novelty: 0.6,
    });

    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(memoryWriteAction(score)).toBe("write_now");
  });

  it("penalizes recently repeated retrievals", () => {
    const score = scoreRetrieval({
      semanticSimilarity: 0.9,
      importance: 0.8,
      recencyDecay: 0.7,
      relationshipRelevance: 0.9,
      currentTopicOverlap: 0.8,
      lastUsedPenalty: 1,
    });

    expect(score).toBeLessThan(0.75);
  });

  it("decays old episodic memories", () => {
    expect(recencyDecay(30, 30)).toBeCloseTo(Math.exp(-1));
  });
});
