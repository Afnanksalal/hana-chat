import { describe, expect, it } from "vitest";
import { mentionSlugForName, resolveMentionedMembers, uniqueMentionSlug } from "./group-chat";

const members = [
  { characterId: "a", mentionSlug: "aria" },
  { characterId: "b", mentionSlug: "blake" },
  { characterId: "c", mentionSlug: "casey_2" },
];

describe("group chat mention routing", () => {
  it("normalizes names into stable mention slugs", () => {
    expect(mentionSlugForName("Aria Night")).toBe("arianight");
    expect(mentionSlugForName("!!!")).toBe("character");
  });

  it("deduplicates colliding mention slugs", () => {
    const taken = new Set(["aria", "aria2"]);

    expect(uniqueMentionSlug("Aria", taken)).toBe("aria3");
  });

  it("resolves exact active mentions in user order", () => {
    expect(
      resolveMentionedMembers("@Blake then @aria please", members).map(
        (member) => member.characterId,
      ),
    ).toEqual(["b", "a"]);
  });

  it("ignores unknown, partial, and duplicate mentions", () => {
    const resolved = resolveMentionedMembers("@aria @arianight @casey_2 @aria @missing", members);

    expect(resolved.map((member) => member.characterId)).toEqual(["a", "c"]);
  });
});
