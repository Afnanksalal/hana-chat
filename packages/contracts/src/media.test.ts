import { describe, expect, it } from "vitest";
import { GenerateMediaAssetRequestSchema } from "./index";

describe("GenerateMediaAssetRequestSchema", () => {
  it("accepts production-sized character image prompts and style presets", () => {
    const payload = GenerateMediaAssetRequestSchema.parse({
      purpose: "character_cover",
      prompt: `fictional character cover scene ${"with detailed persona context ".repeat(180)}`,
      characterName: "Vera Silk",
      style: `cinematic character art, palette-neutral dark-surface readability, ${"fashion editorial detail ".repeat(
        30,
      )}`,
      artDirection: "cinematic",
      mood: "dark",
      backdrop: "city",
      detailLevel: "rich",
      aspectRatio: "16:9",
      referenceImageUrl: "/api/v1/media/11111111-1111-4111-8111-111111111111/file",
    });

    expect(payload.prompt.length).toBeGreaterThan(4_000);
    expect(payload.style.length).toBeGreaterThan(600);
    expect(payload.referenceImageUrl).toContain("/api/v1/media/");
  });
});
