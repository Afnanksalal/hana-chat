export interface MentionableGroupMember {
  characterId: string;
  mentionSlug: string;
}

export type GroupResponseMode = "mentions" | "mentions_and_handoffs";

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
