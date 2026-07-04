export interface MentionableGroupMember {
  characterId: string;
  mentionSlug: string;
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
): TMember[] {
  const bySlug = new Map(members.map((member) => [member.mentionSlug.toLowerCase(), member]));
  const mentioned: TMember[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/@([a-z0-9][a-z0-9_-]{0,31})\b/gi)) {
    const slug = match[1]?.toLowerCase();
    const member = slug ? bySlug.get(slug) : undefined;

    if (!member || seen.has(member.characterId)) {
      continue;
    }

    seen.add(member.characterId);
    mentioned.push(member);
  }

  return mentioned.slice(0, 10);
}
