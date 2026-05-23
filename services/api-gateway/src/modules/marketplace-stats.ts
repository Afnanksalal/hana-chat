import type { CharacterMarketplaceEventType } from "@hana/contracts";
import type { HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import type { Kysely } from "kysely";

export interface MarketplaceStats {
  views: number;
  profileOpens: number;
  chatStarts: number;
  chats: number;
  messages: number;
  likes: number;
  saves: number;
  revenueCents: number;
  ratingAverage: number;
  ratingCount: number;
  interactions: number;
  trendingScore: number;
  lastInteractionAt: string | null;
}

export const DEFAULT_MARKETPLACE_STATS: MarketplaceStats = {
  views: 0,
  profileOpens: 0,
  chatStarts: 0,
  chats: 0,
  messages: 0,
  likes: 0,
  saves: 0,
  revenueCents: 0,
  ratingAverage: 0,
  ratingCount: 0,
  interactions: 0,
  trendingScore: 0,
  lastInteractionAt: null,
};

export function normalizeMarketplaceStats(value: unknown): MarketplaceStats {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_MARKETPLACE_STATS };
  }

  const record = value as Record<string, unknown>;
  const chatStarts = readCount(record["chatStarts"] ?? record["chats"]);
  const stats: MarketplaceStats = {
    views: readCount(record["views"]),
    profileOpens: readCount(record["profileOpens"]),
    chatStarts,
    chats: chatStarts,
    messages: readCount(record["messages"]),
    likes: readCount(record["likes"]),
    saves: readCount(record["saves"]),
    revenueCents: readCount(record["revenueCents"]),
    ratingAverage: readScore(record["ratingAverage"]),
    ratingCount: readCount(record["ratingCount"]),
    interactions: readCount(record["interactions"]),
    trendingScore: readScore(record["trendingScore"]),
    lastInteractionAt:
      typeof record["lastInteractionAt"] === "string" ? record["lastInteractionAt"] : null,
  };

  stats.interactions =
    stats.interactions ||
    stats.views +
      stats.profileOpens +
      stats.chatStarts +
      stats.messages +
      stats.likes +
      stats.saves;
  stats.trendingScore = stats.trendingScore || calculateTrendingScore(stats);

  return stats;
}

export function applyMarketplaceRatingAggregate(
  stats: MarketplaceStats,
  input: { ratingAverage: number; ratingCount: number },
): MarketplaceStats {
  const next = {
    ...stats,
    ratingAverage: clampRating(input.ratingAverage),
    ratingCount: Math.max(0, Math.floor(input.ratingCount)),
    interactions: stats.interactions + 1,
    lastInteractionAt: new Date().toISOString(),
  };

  next.trendingScore = calculateTrendingScore(next);

  return next;
}

export async function incrementMarketplaceStats(
  db: Kysely<HanaDatabase>,
  characterId: string,
  type: CharacterMarketplaceEventType,
  actorUserId?: string,
): Promise<MarketplaceStats> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("creator.characters")
      .select(["id", "marketplace_stats_json"])
      .where("id", "=", characterId)
      .forUpdate()
      .executeTakeFirst();

    if (!row) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    const next = applyMarketplaceEvent(normalizeMarketplaceStats(row.marketplace_stats_json), type);

    await trx
      .insertInto("creator.character_engagement_events")
      .values({
        character_id: characterId,
        actor_user_id: actorUserId ?? null,
        event_type: type,
        metadata_json: {},
      })
      .execute();

    await trx
      .updateTable("creator.characters")
      .set({
        marketplace_stats_json: next,
        updated_at: new Date(),
      })
      .where("id", "=", characterId)
      .execute();

    return next;
  });
}

function applyMarketplaceEvent(
  stats: MarketplaceStats,
  type: CharacterMarketplaceEventType,
): MarketplaceStats {
  const next = { ...stats };

  if (type === "view") {
    next.views += 1;
  } else if (type === "profile_open") {
    next.profileOpens += 1;
  } else if (type === "chat_start") {
    next.chatStarts += 1;
    next.chats = next.chatStarts;
  } else if (type === "message") {
    next.messages += 1;
  } else if (type === "like") {
    next.likes += 1;
  } else if (type === "save") {
    next.saves += 1;
  }

  next.interactions += 1;
  next.lastInteractionAt = new Date().toISOString();
  next.trendingScore = calculateTrendingScore(next);

  return next;
}

function calculateTrendingScore(stats: MarketplaceStats): number {
  const freshness = freshnessMultiplier(stats.lastInteractionAt);
  const weighted =
    stats.views * 0.35 +
    stats.profileOpens * 2.5 +
    stats.chatStarts * 8 +
    stats.messages * 1.4 +
    stats.likes * 12 +
    stats.saves * 7 +
    stats.ratingAverage * stats.ratingCount * 4 +
    (stats.revenueCents / 100) * 3;

  return Number((weighted * freshness).toFixed(3));
}

function freshnessMultiplier(lastInteractionAt: string | null): number {
  if (!lastInteractionAt) {
    return 1;
  }

  const ageMs = Math.max(0, Date.now() - Date.parse(lastInteractionAt));
  const ageDays = ageMs / 86_400_000;

  return Math.max(0.25, 1 / (1 + ageDays / 7));
}

function readCount(value: unknown): number {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function readScore(value: unknown): number {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

function clampRating(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(5, Math.max(0, Number(value.toFixed(2))));
}
