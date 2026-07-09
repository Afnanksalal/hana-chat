export interface MentionableGroupMember {
  characterId: string;
  mentionSlug: string;
}

export type GroupResponseMode = "mentions" | "mentions_and_handoffs";
export type GroupMessageAudience = "room" | "mentioned_bots";
export type GroupMessageIntent =
  | "public_greeting"
  | "public_room_message"
  | "directed_greeting"
  | "directed_prompt";

export interface GroupMessageRouting {
  audience: GroupMessageAudience;
  intent: GroupMessageIntent;
  responseExpected: boolean;
  memoryEligible: boolean;
}

export const GROUP_CHAT_MAX_USER_MENTIONED_BOTS = 10;
export const GROUP_CHAT_MAX_BOT_HANDOFFS_PER_TURN = 3;
export const GROUP_CHAT_MAX_BOT_HANDOFF_DEPTH = 1;

export function isGroupResponseMode(value: string): value is GroupResponseMode {
  return value === "mentions" || value === "mentions_and_handoffs";
}

export function groupResponseModeAllowsBotHandoffs(mode: GroupResponseMode): boolean {
  return mode === "mentions_and_handoffs";
}

export function mentionSlugForName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);

  return normalized || "character";
}

export function uniqueMentionSlug(name: string, taken: Set<string>): string {
  const base = mentionSlugForName(name);
  let candidate = base;
  let suffix = 2;

  while (taken.has(candidate)) {
    const suffixText = String(suffix);
    candidate = `${base.slice(0, Math.max(1, 32 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  return candidate;
}

export function resolveMentionedMembers<TMember extends MentionableGroupMember>(
  content: string,
  members: TMember[],
  options: {
    excludeCharacterIds?: ReadonlySet<string>;
    limit?: number;
  } = {},
): TMember[] {
  const bySlug = new Map(members.map((member) => [member.mentionSlug.toLowerCase(), member]));
  const mentioned: TMember[] = [];
  const seen = new Set<string>();
  const limit = Math.max(0, Math.min(options.limit ?? GROUP_CHAT_MAX_USER_MENTIONED_BOTS, 10));

  for (const match of content.matchAll(/@([a-z0-9][a-z0-9_-]{0,31})\b/gi)) {
    const slug = match[1]?.toLowerCase();
    const member = slug ? bySlug.get(slug) : undefined;

    if (
      !member ||
      seen.has(member.characterId) ||
      options.excludeCharacterIds?.has(member.characterId)
    ) {
      continue;
    }

    seen.add(member.characterId);
    mentioned.push(member);

    if (mentioned.length >= limit) {
      break;
    }
  }

  return mentioned;
}

export function classifyGroupMessageRouting(
  content: string,
  mentionedMembers: readonly MentionableGroupMember[],
): GroupMessageRouting {
  const mentionSlugs = mentionedMembers.map((member) => member.mentionSlug);
  const messageWithoutMentions = removeKnownGroupMentions(content, mentionSlugs);
  const lightweightGreeting = isLightweightGroupGreeting(messageWithoutMentions || content);

  if (mentionedMembers.length === 0) {
    return {
      audience: "room",
      intent: lightweightGreeting ? "public_greeting" : "public_room_message",
      responseExpected: false,
      memoryEligible: false,
    };
  }

  return {
    audience: "mentioned_bots",
    intent: lightweightGreeting ? "directed_greeting" : "directed_prompt",
    responseExpected: true,
    memoryEligible: !lightweightGreeting,
  };
}

export function removeKnownGroupMentions(content: string, mentionSlugs: readonly string[]): string {
  let cleaned = content;

  for (const slug of mentionSlugs) {
    cleaned = cleaned.replace(new RegExp(`@${escapeRegExp(slug)}\\b`, "gi"), " ");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

function isLightweightGroupGreeting(content: string): boolean {
  const normalized = content
    .toLowerCase()
    .replace(/['"`~!?.。,，:;()[\]{}<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  return /^(hi|hello|hey|yo|hiya|heya|sup|gm|gn|good morning|good evening|good night|namaste|hai)(\s+(there|all|everyone|everybody|guys|yall|room|bot|bots|friend|friends))?$/.test(
    normalized,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
