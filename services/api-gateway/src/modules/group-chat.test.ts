import { describe, expect, it } from "vitest";
import {
  classifyGroupMessageRouting,
  groupResponseModeAllowsBotHandoffs,
  mentionSlugForName,
  removeKnownGroupMentions,
  resolveMentionedMembers,
  uniqueMentionSlug,
} from "./group-chat";

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

  it("supports server-owned exclusions and caps for bot handoffs", () => {
    const resolved = resolveMentionedMembers("@aria @blake @casey_2", members, {
      excludeCharacterIds: new Set(["b"]),
      limit: 1,
    });

    expect(resolved.map((member) => member.characterId)).toEqual(["a"]);
  });

  it("enables bot handoffs only for the handoff response mode", () => {
    expect(groupResponseModeAllowsBotHandoffs("mentions")).toBe(false);
    expect(groupResponseModeAllowsBotHandoffs("mentions_and_handoffs")).toBe(true);
  });

  it("classifies unmentioned lightweight greetings as public room speech", () => {
    expect(classifyGroupMessageRouting("Hi", []).intent).toBe("public_greeting");
    expect(classifyGroupMessageRouting("hello everyone!", []).audience).toBe("room");
    expect(classifyGroupMessageRouting("hello everyone!", []).responseExpected).toBe(false);
    expect(classifyGroupMessageRouting("hello everyone!", []).memoryEligible).toBe(false);
  });

  it("classifies mentioned greetings as lightweight directed turns", () => {
    const mentioned = [members[1]];

    expect(classifyGroupMessageRouting("@blake hi", mentioned)).toEqual({
      audience: "mentioned_bots",
      intent: "directed_greeting",
      responseExpected: true,
      memoryEligible: false,
    });
  });

  it("keeps substantive mentioned prompts memory eligible", () => {
    const mentioned = [members[0], members[2]];

    expect(
      classifyGroupMessageRouting(
        "@aria @casey_2 what do you both remember about the plan?",
        mentioned,
      ),
    ).toMatchObject({
      audience: "mentioned_bots",
      intent: "directed_prompt",
      responseExpected: true,
      memoryEligible: true,
    });
  });

  it("removes only canonical group mentions from transcript text", () => {
    expect(removeKnownGroupMentions("@Blake hi @missing", ["blake"])).toBe("hi @missing");
  });
});
