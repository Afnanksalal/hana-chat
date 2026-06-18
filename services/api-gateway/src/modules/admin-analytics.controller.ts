import { loadConfig } from "@hana/config";
import { AdminAnalyticsQuerySchema } from "@hana/contracts";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Kysely, sql } from "kysely";
import { normalizeMarketplaceStats } from "./marketplace-stats";
import { requireAdmin } from "./session";
import {
  costTicksToUsd,
  estimateImageGenerationCostUsd,
  estimateTextModelCostUsd,
} from "./xai-pricing";

type Db = Kysely<HanaDatabase>;
type ServiceHealthStatus = "ok" | "degraded";

interface ServiceBoundary {
  name: string;
  role: string;
  port: number;
  topics: string[];
  healthUrl: string;
}

interface CountRow {
  count: number | string | null;
}

interface TimeSeriesRow {
  day: string;
  signups: number | string | null;
  messages: number | string | null;
  model_calls: number | string | null;
  safety_blocks: number | string | null;
  revenue_cents: number | string | null;
  marketplace_interactions: number | string | null;
}

interface ModelCostRow {
  provider: string;
  model: string;
  calls: number | string | null;
  average_latency_ms: number | string | null;
  input_tokens: number | string | null;
  cached_input_tokens: number | string | null;
  output_tokens: number | string | null;
  exact_cost_ticks: number | string | null;
  stored_cost_usd: number | string | null;
  fallback_input_tokens: number | string | null;
  fallback_cached_input_tokens: number | string | null;
  fallback_output_tokens: number | string | null;
}

@Controller("/v1/admin/analytics")
export class AdminAnalyticsController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get()
  public async overview(
    @Headers("authorization") authorization?: string,
    @Query("rangeDays") rangeDaysRaw?: string,
  ) {
    await requireAdmin(this.db, this.config, authorization);
    const { rangeDays } = AdminAnalyticsQuerySchema.parse({
      ...(rangeDaysRaw ? { rangeDays: rangeDaysRaw } : {}),
    });
    const now = new Date();
    const since = daysAgo(rangeDays, now);
    const since24h = daysAgo(1, now);
    const since7d = daysAgo(7, now);
    const seriesStart = startOfUtcDay(daysAgo(Math.min(rangeDays, 30) - 1, now));

    const [
      totalUsers,
      newUsers,
      activeUsers24h,
      activeUsers7d,
      activeUsersRange,
      activeConversations,
      messageCounts,
      modelSummary,
      safetySummary,
      memorySummary,
      marketplaceSummary,
      billingSummary,
      outboxSummary,
      topCharacters,
      modelRoutes,
      imageGenerationSummary,
      safetyActions,
      safetyCategories,
      queueStatuses,
      recentAuditEvents,
      recentSafetyBlocks,
      timeSeries,
      planDistribution,
      boundaryHealth,
    ] = await Promise.all([
      countUsers(this.db),
      countUsers(this.db, since),
      activeUsersSince(this.db, since24h),
      activeUsersSince(this.db, since7d),
      activeUsersSince(this.db, since),
      countActiveConversations(this.db),
      countMessages(this.db, since),
      modelCallSummary(this.db, since),
      safetyDecisionSummary(this.db, since),
      memorySystemSummary(this.db, since),
      marketplaceActivitySummary(this.db, since),
      billingActivitySummary(this.db, since),
      outboxHealthSummary(this.db, since24h),
      topMarketplaceCharacters(this.db, since),
      modelRoutesSummary(this.db, since),
      imageGenerationCostSummary(this.db, since),
      safetyActionBreakdown(this.db, since),
      safetyCategoryBreakdown(this.db, since),
      queueStatusBreakdown(this.db),
      recentAuditTrail(this.db),
      recentBlockedSafetyDecisions(this.db),
      adminTimeSeries(this.db, seriesStart, now),
      subscriptionPlanDistribution(this.db),
      serviceBoundaryHealth(this.db, this.config),
    ]);

    return {
      generatedAt: now.toISOString(),
      rangeDays,
      kpis: {
        totalUsers,
        newUsers,
        activeUsers24h,
        activeUsers7d,
        activeUsersRange,
        activeConversations,
        userMessages: messageCounts.userMessages,
        assistantMessages: messageCounts.assistantMessages,
        modelCalls: modelSummary.calls,
        averageModelLatencyMs: modelSummary.averageLatencyMs,
        p95ModelLatencyMs: modelSummary.p95LatencyMs,
        modelInputTokens: modelSummary.inputTokens,
        modelOutputTokens: modelSummary.outputTokens,
        estimatedModelCostUsd: modelSummary.estimatedCostUsd,
        safetyBlocks: safetySummary.blockedDecisions,
        safetyBlockRate: ratio(safetySummary.blockedDecisions, safetySummary.decisions),
        activeMemories: memorySummary.activeFacts,
        memoriesCreated: memorySummary.createdFacts,
        marketplaceInteractions: marketplaceSummary.interactions,
        marketplaceChatStarts: marketplaceSummary.chatStarts,
        paidRevenueCents: billingSummary.paidRevenueCents,
        openPayoutCents: billingSummary.openPayoutCents,
        pendingOutbox: outboxSummary.pending,
        deadLetterOutbox: outboxSummary.deadLetter,
      },
      growth: {
        planDistribution,
        timeSeries,
      },
      marketplace: {
        ...marketplaceSummary,
        topCharacters,
      },
      modelHealth: {
        ...modelSummary,
        imageGenerations: imageGenerationSummary,
        totalEstimatedCostUsd:
          modelSummary.estimatedCostUsd + imageGenerationSummary.estimatedCostUsd,
        routes: modelRoutes,
      },
      safety: {
        ...safetySummary,
        actions: safetyActions,
        categories: safetyCategories,
        recentBlocks: recentSafetyBlocks,
      },
      memory: memorySummary,
      billing: billingSummary,
      queues: {
        ...outboxSummary,
        statuses: queueStatuses,
      },
      boundaries: boundaryHealth,
      auditTrail: recentAuditEvents,
    };
  }
}

async function countUsers(db: Db, since?: Date): Promise<number> {
  let query = db
    .selectFrom("identity.users")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "!=", "deleted");

  if (since) {
    query = query.where("created_at", ">=", since);
  }

  return toInt((await query.executeTakeFirst())?.count);
}

async function activeUsersSince(db: Db, since: Date): Promise<number> {
  const result = await sql<CountRow>`
    SELECT COUNT(DISTINCT user_id)::integer AS count
    FROM (
      SELECT user_id FROM chat.messages WHERE role = 'user' AND created_at >= ${since}
      UNION
      SELECT user_id FROM identity.sessions WHERE last_seen_at >= ${since}
    ) active_users
  `.execute(db);

  return toInt(result.rows[0]?.count);
}

async function countActiveConversations(db: Db): Promise<number> {
  const result = await db
    .selectFrom("chat.conversations")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "=", "active")
    .executeTakeFirst();

  return toInt(result?.count);
}

async function countMessages(
  db: Db,
  since: Date,
): Promise<{ userMessages: number; assistantMessages: number }> {
  const rows = await db
    .selectFrom("chat.messages")
    .select(["role", (eb) => eb.fn.countAll<number>().as("count")])
    .where("created_at", ">=", since)
    .where("role", "in", ["user", "assistant"])
    .groupBy("role")
    .execute();

  return {
    userMessages: toInt(rows.find((row) => row.role === "user")?.count),
    assistantMessages: toInt(rows.find((row) => row.role === "assistant")?.count),
  };
}

async function modelCallSummary(db: Db, since: Date) {
  const [summaryResult, costRows] = await Promise.all([
    sql<{
      calls: number | string | null;
      input_tokens: number | string | null;
      cached_input_tokens: number | string | null;
      output_tokens: number | string | null;
      average_latency_ms: number | string | null;
      p95_latency_ms: number | string | null;
    }>`
      SELECT
        COUNT(*)::integer AS calls,
        COALESCE(SUM(input_tokens), 0)::integer AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0)::integer AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0)::integer AS output_tokens,
        COALESCE(ROUND(AVG(latency_ms))::integer, 0) AS average_latency_ms,
        COALESCE(ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::integer, 0)
          AS p95_latency_ms
      FROM analytics.model_calls
      WHERE created_at >= ${since}
    `.execute(db),
    modelCostRows(db, since),
  ]);
  const row = summaryResult.rows[0];

  return {
    calls: toInt(row?.calls),
    inputTokens: toInt(row?.input_tokens),
    cachedInputTokens: toInt(row?.cached_input_tokens),
    outputTokens: toInt(row?.output_tokens),
    estimatedCostUsd: costRows.reduce((sum, costRow) => sum + modelCostUsd(costRow), 0),
    averageLatencyMs: toInt(row?.average_latency_ms),
    p95LatencyMs: toInt(row?.p95_latency_ms),
  };
}

async function modelRoutesSummary(db: Db, since: Date) {
  const rows = await modelCostRows(db, since, 12);

  return rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    calls: toInt(row.calls),
    averageLatencyMs: toInt(row.average_latency_ms),
    inputTokens: toInt(row.input_tokens),
    cachedInputTokens: toInt(row.cached_input_tokens),
    outputTokens: toInt(row.output_tokens),
    estimatedCostUsd: modelCostUsd(row),
  }));
}

async function modelCostRows(db: Db, since: Date, limit?: number): Promise<ModelCostRow[]> {
  const limitClause = limit ? sql`LIMIT ${limit}` : sql``;
  const result = await sql<ModelCostRow>`
    SELECT
      provider,
      model,
      COUNT(*)::integer AS calls,
      COALESCE(ROUND(AVG(latency_ms))::integer, 0) AS average_latency_ms,
      COALESCE(SUM(input_tokens), 0)::integer AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0)::integer AS cached_input_tokens,
      COALESCE(SUM(output_tokens), 0)::integer AS output_tokens,
      SUM(cost_in_usd_ticks)::text AS exact_cost_ticks,
      COALESCE(
        SUM(estimated_cost_usd)
          FILTER (WHERE cost_in_usd_ticks IS NULL AND estimated_cost_usd > 0),
        0
      )::text AS stored_cost_usd,
      COALESCE(
        SUM(input_tokens)
          FILTER (WHERE cost_in_usd_ticks IS NULL AND estimated_cost_usd <= 0),
        0
      )::integer AS fallback_input_tokens,
      COALESCE(
        SUM(cached_input_tokens)
          FILTER (WHERE cost_in_usd_ticks IS NULL AND estimated_cost_usd <= 0),
        0
      )::integer AS fallback_cached_input_tokens,
      COALESCE(
        SUM(output_tokens)
          FILTER (WHERE cost_in_usd_ticks IS NULL AND estimated_cost_usd <= 0),
        0
      )::integer AS fallback_output_tokens
    FROM analytics.model_calls
    WHERE created_at >= ${since}
    GROUP BY provider, model
    ORDER BY calls DESC, provider ASC, model ASC
    ${limitClause}
  `.execute(db);

  return result.rows;
}

function modelCostUsd(row: ModelCostRow): number {
  const exactCost = costTicksToUsd(toFloat(row.exact_cost_ticks)) ?? 0;
  const storedCost = toFloat(row.stored_cost_usd);
  const fallbackCost = estimateTextModelCostUsd({
    provider: row.provider,
    model: row.model,
    inputTokens: toInt(row.fallback_input_tokens),
    cachedInputTokens: toInt(row.fallback_cached_input_tokens),
    outputTokens: toInt(row.fallback_output_tokens),
  });

  return exactCost + storedCost + fallbackCost;
}

async function imageGenerationCostSummary(db: Db, since: Date) {
  const result = await sql<{
    provider: string;
    model: string;
    purpose: string;
    aspect_ratio: string;
    resolution: string | null;
    images: number | string | null;
    exact_cost_ticks: number | string | null;
    fallback_images: number | string | null;
  }>`
    SELECT
      'xai' AS provider,
      COALESCE(NULLIF(metadata_json->>'model', ''), 'grok-imagine-image-quality') AS model,
      COALESCE(NULLIF(metadata_json->>'purpose', ''), purpose) AS purpose,
      COALESCE(NULLIF(metadata_json->>'aspectRatio', ''), '1:1') AS aspect_ratio,
      NULLIF(metadata_json->>'resolution', '') AS resolution,
      COUNT(*)::integer AS images,
      SUM(
        CASE
          WHEN metadata_json->>'costTicks' ~ '^[0-9]+$'
          THEN (metadata_json->>'costTicks')::numeric
          ELSE NULL
        END
      )::text AS exact_cost_ticks,
      COUNT(*) FILTER (
        WHERE NOT (COALESCE(metadata_json->>'costTicks', '') ~ '^[0-9]+$')
      )::integer AS fallback_images
    FROM creator.media_assets
    WHERE created_at >= ${since}
      AND metadata_json @> '{"source":"xai-image-generation"}'::jsonb
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY images DESC, model ASC, purpose ASC
    LIMIT 12
  `.execute(db);
  const routes = result.rows.map((row) => {
    const exactCost = costTicksToUsd(toFloat(row.exact_cost_ticks)) ?? 0;
    const fallbackCost = estimateImageGenerationCostUsd({
      provider: row.provider,
      model: row.model,
      images: toInt(row.fallback_images),
      resolution: row.resolution,
    });

    return {
      provider: row.provider,
      model: row.model,
      purpose: row.purpose,
      aspectRatio: row.aspect_ratio,
      images: toInt(row.images),
      estimatedCostUsd: exactCost + fallbackCost,
    };
  });

  return {
    images: routes.reduce((sum, route) => sum + route.images, 0),
    estimatedCostUsd: routes.reduce((sum, route) => sum + route.estimatedCostUsd, 0),
    routes,
  };
}

async function safetyDecisionSummary(db: Db, since: Date) {
  const result = await sql<{
    decisions: number | string | null;
    blocked_decisions: number | string | null;
    transformed_decisions: number | string | null;
    output_blocks: number | string | null;
  }>`
    SELECT
      COUNT(*)::integer AS decisions,
      COUNT(*) FILTER (WHERE action = 'block')::integer AS blocked_decisions,
      COUNT(*) FILTER (WHERE action <> 'allow' AND action <> 'block')::integer
        AS transformed_decisions,
      COUNT(*) FILTER (WHERE stage = 'model_output' AND action <> 'allow')::integer
        AS output_blocks
    FROM safety.decisions
    WHERE created_at >= ${since}
  `.execute(db);
  const row = result.rows[0];

  return {
    decisions: toInt(row?.decisions),
    blockedDecisions: toInt(row?.blocked_decisions),
    transformedDecisions: toInt(row?.transformed_decisions),
    outputBlocks: toInt(row?.output_blocks),
  };
}

async function safetyActionBreakdown(db: Db, since: Date) {
  const rows = await db
    .selectFrom("safety.decisions")
    .select(["action", sql<number>`COUNT(*)::integer`.as("count")])
    .where("created_at", ">=", since)
    .groupBy("action")
    .orderBy("count", "desc")
    .execute();

  return rows.map((row) => ({
    action: row.action,
    count: toInt(row.count),
  }));
}

async function safetyCategoryBreakdown(db: Db, since: Date) {
  const result = await sql<{ category: string; count: number | string | null }>`
    SELECT category, COUNT(*)::integer AS count
    FROM safety.decisions, unnest(categories) AS category
    WHERE created_at >= ${since}
    GROUP BY category
    ORDER BY count DESC, category ASC
    LIMIT 12
  `.execute(db);

  return result.rows.map((row) => ({
    category: row.category,
    count: toInt(row.count),
  }));
}

async function recentBlockedSafetyDecisions(db: Db) {
  const rows = await db
    .selectFrom("safety.decisions as decisions")
    .leftJoin("identity.users as users", "users.id", "decisions.user_id")
    .select([
      "decisions.id",
      "decisions.stage",
      "decisions.action",
      "decisions.reason_code",
      "decisions.categories",
      "decisions.created_at",
      "users.display_name",
    ])
    .where("decisions.action", "!=", "allow")
    .orderBy("decisions.created_at", "desc")
    .limit(8)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    action: row.action,
    reasonCode: row.reason_code,
    categories: row.categories,
    userDisplayName: row.display_name ?? "Unknown user",
    createdAt: row.created_at.toISOString(),
  }));
}

async function memorySystemSummary(db: Db, since: Date) {
  const [facts, created, evolution, activeConversationFacts] = await Promise.all([
    db
      .selectFrom("memory.facts")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("is_active", "=", true)
      .executeTakeFirst(),
    db
      .selectFrom("memory.facts")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("created_at", ">=", since)
      .executeTakeFirst(),
    db
      .selectFrom("chat.conversation_evolution")
      .select([
        sql<number>`COUNT(*)::integer`.as("profiles"),
        sql<number>`COALESCE(ROUND(AVG(relationship_depth))::integer, 0)`.as(
          "average_relationship_depth",
        ),
        sql<number>`COALESCE(ROUND(AVG(memory_count))::integer, 0)`.as("average_memory_count"),
      ])
      .executeTakeFirstOrThrow(),
    sql<{
      conversations_with_memory: number | string | null;
      average_facts: number | string | null;
    }>`
      SELECT
        COUNT(*)::integer AS conversations_with_memory,
        COALESCE(ROUND(AVG(fact_count))::integer, 0) AS average_facts
      FROM (
        SELECT conversation_id, COUNT(*) AS fact_count
        FROM memory.facts
        WHERE is_active = true AND scope = 'conversation' AND conversation_id IS NOT NULL
        GROUP BY conversation_id
      ) memory_by_conversation
    `.execute(db),
  ]);
  const activeConversationFactsRow = activeConversationFacts.rows[0];

  return {
    activeFacts: toInt(facts?.count),
    createdFacts: toInt(created?.count),
    evolutionProfiles: toInt(evolution.profiles),
    averageRelationshipDepth: toInt(evolution.average_relationship_depth),
    averageMemoryCount: toInt(evolution.average_memory_count),
    conversationsWithMemory: toInt(activeConversationFactsRow?.conversations_with_memory),
    averageFactsPerConversation: toInt(activeConversationFactsRow?.average_facts),
  };
}

async function marketplaceActivitySummary(db: Db, since: Date) {
  const [events, characterInventory, ratings] = await Promise.all([
    db
      .selectFrom("creator.character_engagement_events")
      .select([
        sql<number>`COUNT(*)::integer`.as("interactions"),
        sql<number>`COUNT(*) FILTER (WHERE event_type = 'view')::integer`.as("views"),
        sql<number>`COUNT(*) FILTER (WHERE event_type = 'profile_open')::integer`.as(
          "profile_opens",
        ),
        sql<number>`COUNT(*) FILTER (WHERE event_type = 'chat_start')::integer`.as("chat_starts"),
        sql<number>`COUNT(*) FILTER (WHERE event_type = 'message')::integer`.as("messages"),
        sql<number>`COUNT(*) FILTER (WHERE event_type = 'like')::integer`.as("likes"),
        sql<number>`COUNT(*) FILTER (WHERE event_type = 'save')::integer`.as("saves"),
      ])
      .where("created_at", ">=", since)
      .executeTakeFirstOrThrow(),
    sql<{
      total_characters: number | string | null;
      public_characters: number | string | null;
      private_characters: number | string | null;
      pending_review_characters: number | string | null;
      adult_characters: number | string | null;
    }>`
      SELECT
        COUNT(*) FILTER (
          WHERE characters.moderation_status <> 'rejected'
        )::integer AS total_characters,
        COUNT(*) FILTER (
          WHERE characters.visibility = 'public'
            AND characters.moderation_status = 'approved'
        )::integer AS public_characters,
        COUNT(*) FILTER (
          WHERE characters.visibility <> 'public'
            AND characters.moderation_status <> 'rejected'
        )::integer AS private_characters,
        COUNT(*) FILTER (
          WHERE characters.moderation_status = 'pending_review'
        )::integer AS pending_review_characters,
        COUNT(*) FILTER (
          WHERE versions.rating IN ('mature', 'adult')
            AND characters.moderation_status <> 'rejected'
        )::integer AS adult_characters
      FROM creator.characters AS characters
      LEFT JOIN creator.character_versions AS versions
        ON versions.id = characters.current_version_id
    `.execute(db),
    db
      .selectFrom("creator.character_ratings")
      .select([
        sql<number>`COUNT(*)::integer`.as("count"),
        sql<number>`COALESCE(ROUND(AVG(score)::numeric, 2), 0)::double precision`.as("average"),
      ])
      .where("updated_at", ">=", since)
      .executeTakeFirstOrThrow(),
  ]);

  return {
    interactions: toInt(events.interactions),
    views: toInt(events.views),
    profileOpens: toInt(events.profile_opens),
    chatStarts: toInt(events.chat_starts),
    messages: toInt(events.messages),
    likes: toInt(events.likes),
    saves: toInt(events.saves),
    totalCharacters: toInt(characterInventory.rows[0]?.total_characters),
    publicCharacters: toInt(characterInventory.rows[0]?.public_characters),
    privateCharacters: toInt(characterInventory.rows[0]?.private_characters),
    pendingReviewCharacters: toInt(characterInventory.rows[0]?.pending_review_characters),
    adultCharacters: toInt(characterInventory.rows[0]?.adult_characters),
    ratings: toInt(ratings.count),
    averageRating: toFloat(ratings.average),
  };
}

async function topMarketplaceCharacters(db: Db, since: Date) {
  const messageCounts = db
    .selectFrom("chat.messages")
    .select(["character_id", sql<number>`COUNT(*)::integer`.as("messages")])
    .where("created_at", ">=", since)
    .where("role", "=", "user")
    .groupBy("character_id")
    .as("message_counts");
  const purchaseCounts = db
    .selectFrom("billing.character_purchases")
    .select([
      "character_id",
      sql<number>`COUNT(*)::integer`.as("paid_unlocks"),
      sql<number>`COALESCE(SUM(amount_cents), 0)::integer`.as("revenue_cents"),
    ])
    .where("created_at", ">=", since)
    .where("status", "=", "paid")
    .groupBy("character_id")
    .as("purchase_counts");
  const characters = await db
    .selectFrom("creator.characters as characters")
    .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
    .leftJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .leftJoin(messageCounts, "message_counts.character_id", "characters.id")
    .leftJoin(purchaseCounts, "purchase_counts.character_id", "characters.id")
    .select([
      "characters.id",
      "characters.name",
      "characters.marketplace_category",
      "characters.marketplace_stats_json",
      "characters.price_cents",
      "characters.monetization_enabled",
      "characters.visibility",
      "characters.moderation_status",
      "creators.display_name as creator_display_name",
      "versions.rating",
      sql<number>`COALESCE(message_counts.messages, 0)::integer`.as("messages"),
      sql<number>`COALESCE(purchase_counts.paid_unlocks, 0)::integer`.as("paid_unlocks"),
      sql<number>`COALESCE(purchase_counts.revenue_cents, 0)::integer`.as("revenue_cents"),
      sql<number>`COALESCE((characters.marketplace_stats_json->>'trendingScore')::double precision, 0)`.as(
        "trending_score",
      ),
    ])
    .where("characters.moderation_status", "!=", "rejected")
    .orderBy(sql<number>`COALESCE(message_counts.messages, 0)`, "desc")
    .orderBy("trending_score", "desc")
    .orderBy("characters.updated_at", "desc")
    .limit(24)
    .execute();

  return characters.map((character) => {
    const stats = normalizeMarketplaceStats(character.marketplace_stats_json);
    const rating = character.rating ?? "teen";

    return {
      id: character.id,
      name: character.name,
      creatorName: character.creator_display_name ?? "Creator",
      category: character.marketplace_category,
      rating,
      visibility: character.visibility,
      moderationStatus: character.moderation_status,
      isAdult: rating === "mature" || rating === "adult",
      monetizationEnabled: character.monetization_enabled,
      priceCents: character.price_cents,
      trendingScore: stats.trendingScore,
      ratingAverage: stats.ratingAverage,
      ratingCount: stats.ratingCount,
      interactions: stats.interactions,
      messages: toInt(character.messages),
      paidUnlocks: toInt(character.paid_unlocks),
      revenueCents: toInt(character.revenue_cents),
    };
  });
}

async function billingActivitySummary(db: Db, since: Date) {
  const [
    subscriptionRevenue,
    characterRevenue,
    openPayouts,
    pendingProfiles,
    activePaidSubscriptions,
    webhookLag,
  ] = await Promise.all([
    db
      .selectFrom("billing.payment_orders")
      .select([
        sql<number>`COUNT(*)::integer`.as("orders"),
        sql<number>`COUNT(*) FILTER (WHERE status = 'paid')::integer`.as("paid_orders"),
        sql<number>`COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::integer`.as(
          "paid_revenue_cents",
        ),
      ])
      .where("created_at", ">=", since)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("billing.character_purchases")
      .select([
        sql<number>`COUNT(*)::integer`.as("orders"),
        sql<number>`COUNT(*) FILTER (WHERE status = 'paid')::integer`.as("paid_orders"),
        sql<number>`COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::integer`.as(
          "paid_revenue_cents",
        ),
        sql<number>`COALESCE(SUM(platform_fee_cents) FILTER (WHERE status = 'paid'), 0)::integer`.as(
          "platform_fee_cents",
        ),
      ])
      .where("created_at", ">=", since)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("billing.creator_payouts")
      .select([
        sql<number>`COUNT(*)::integer`.as("count"),
        sql<number>`COALESCE(SUM(amount_cents), 0)::integer`.as("amount_cents"),
      ])
      .where("status", "in", ["requested", "approved", "processing"])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("billing.creator_payout_profiles")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("status", "=", "pending_review")
      .executeTakeFirst(),
    db
      .selectFrom("billing.subscriptions")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("plan_id", "in", ["plus", "ultra"])
      .where("status", "in", ["active", "trialing"])
      .where("current_period_end", ">", new Date())
      .executeTakeFirst(),
    db
      .selectFrom("billing.webhook_events")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("processed_at", "is", null)
      .executeTakeFirst(),
  ]);
  const paidRevenueCents =
    toInt(subscriptionRevenue.paid_revenue_cents) + toInt(characterRevenue.paid_revenue_cents);

  return {
    checkoutOrders: toInt(subscriptionRevenue.orders),
    paidCheckoutOrders: toInt(subscriptionRevenue.paid_orders),
    characterPurchaseOrders: toInt(characterRevenue.orders),
    paidCharacterPurchases: toInt(characterRevenue.paid_orders),
    paidRevenueCents,
    subscriptionRevenueCents: toInt(subscriptionRevenue.paid_revenue_cents),
    characterRevenueCents: toInt(characterRevenue.paid_revenue_cents),
    platformFeeCents: toInt(characterRevenue.platform_fee_cents),
    openPayoutCount: toInt(openPayouts.count),
    openPayoutCents: toInt(openPayouts.amount_cents),
    pendingPayoutProfiles: toInt(pendingProfiles?.count),
    activePaidSubscriptions: toInt(activePaidSubscriptions?.count),
    unprocessedWebhooks: toInt(webhookLag?.count),
  };
}

async function outboxHealthSummary(db: Db, since24h: Date) {
  const [pending, deadLetter, failed, published, oldest] = await Promise.all([
    countOutboxStatus(db, "pending"),
    countOutboxStatus(db, "dead_letter"),
    countOutboxStatus(db, "failed"),
    db
      .selectFrom("platform.outbox_events")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("status", "=", "published")
      .where("occurred_at", ">=", since24h)
      .executeTakeFirst(),
    sql<{ oldest_age_seconds: number | string | null }>`
      SELECT EXTRACT(EPOCH FROM (now() - MIN(occurred_at)))::integer AS oldest_age_seconds
      FROM platform.outbox_events
      WHERE status IN ('pending', 'failed', 'processing')
    `.execute(db),
  ]);

  return {
    pending,
    failed,
    deadLetter,
    published24h: toInt(published?.count),
    oldestOpenAgeSeconds: toInt(oldest.rows[0]?.oldest_age_seconds),
  };
}

async function countOutboxStatus(
  db: Db,
  status: "pending" | "failed" | "dead_letter",
): Promise<number> {
  const row = await db
    .selectFrom("platform.outbox_events")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "=", status)
    .executeTakeFirst();

  return toInt(row?.count);
}

async function queueStatusBreakdown(db: Db) {
  const rows = await db
    .selectFrom("platform.outbox_events")
    .select(["status", sql<number>`COUNT(*)::integer`.as("count")])
    .groupBy("status")
    .orderBy("status")
    .execute();

  return rows.map((row) => ({
    status: row.status,
    count: toInt(row.count),
  }));
}

async function recentAuditTrail(db: Db) {
  const rows = await db
    .selectFrom("platform.audit_events as audit")
    .leftJoin("identity.users as users", "users.id", "audit.actor_user_id")
    .select([
      "audit.id",
      "audit.action",
      "audit.resource_type",
      "audit.resource_id",
      "audit.created_at",
      "users.display_name",
    ])
    .orderBy("audit.created_at", "desc")
    .limit(10)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actorDisplayName: row.display_name ?? "System",
    createdAt: row.created_at.toISOString(),
  }));
}

async function adminTimeSeries(db: Db, seriesStart: Date, now: Date) {
  const result = await sql<TimeSeriesRow>`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${seriesStart}::timestamptz),
        date_trunc('day', ${now}::timestamptz),
        interval '1 day'
      )::date AS day
    ),
    signups AS (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::integer AS count
      FROM identity.users
      WHERE created_at >= ${seriesStart}
      GROUP BY 1
    ),
    messages AS (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::integer AS count
      FROM chat.messages
      WHERE role = 'user' AND created_at >= ${seriesStart}
      GROUP BY 1
    ),
    model_calls AS (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::integer AS count
      FROM analytics.model_calls
      WHERE created_at >= ${seriesStart}
      GROUP BY 1
    ),
    safety_blocks AS (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::integer AS count
      FROM safety.decisions
      WHERE action <> 'allow' AND created_at >= ${seriesStart}
      GROUP BY 1
    ),
    revenue AS (
      SELECT day, SUM(amount_cents)::integer AS amount_cents
      FROM (
        SELECT date_trunc('day', created_at)::date AS day, amount_cents
        FROM billing.payment_orders
        WHERE status = 'paid' AND created_at >= ${seriesStart}
        UNION ALL
        SELECT date_trunc('day', created_at)::date AS day, amount_cents
        FROM billing.character_purchases
        WHERE status = 'paid' AND created_at >= ${seriesStart}
      ) paid_events
      GROUP BY day
    ),
    marketplace AS (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::integer AS count
      FROM creator.character_engagement_events
      WHERE created_at >= ${seriesStart}
      GROUP BY 1
    )
    SELECT
      to_char(days.day, 'YYYY-MM-DD') AS day,
      COALESCE(signups.count, 0)::integer AS signups,
      COALESCE(messages.count, 0)::integer AS messages,
      COALESCE(model_calls.count, 0)::integer AS model_calls,
      COALESCE(safety_blocks.count, 0)::integer AS safety_blocks,
      COALESCE(revenue.amount_cents, 0)::integer AS revenue_cents,
      COALESCE(marketplace.count, 0)::integer AS marketplace_interactions
    FROM days
    LEFT JOIN signups ON signups.day = days.day
    LEFT JOIN messages ON messages.day = days.day
    LEFT JOIN model_calls ON model_calls.day = days.day
    LEFT JOIN safety_blocks ON safety_blocks.day = days.day
    LEFT JOIN revenue ON revenue.day = days.day
    LEFT JOIN marketplace ON marketplace.day = days.day
    ORDER BY days.day ASC
  `.execute(db);

  return result.rows.map((row) => ({
    day: row.day,
    signups: toInt(row.signups),
    messages: toInt(row.messages),
    modelCalls: toInt(row.model_calls),
    safetyBlocks: toInt(row.safety_blocks),
    revenueCents: toInt(row.revenue_cents),
    marketplaceInteractions: toInt(row.marketplace_interactions),
  }));
}

async function subscriptionPlanDistribution(db: Db) {
  const rows = await sql<{ plan_id: string; users: number | string | null }>`
    WITH latest_subscription AS (
      SELECT DISTINCT ON (user_id) user_id, plan_id
      FROM billing.subscriptions
      WHERE status IN ('active', 'trialing') AND current_period_end > now()
      ORDER BY user_id, current_period_end DESC
    )
    SELECT COALESCE(latest_subscription.plan_id, 'free') AS plan_id, COUNT(users.id)::integer AS users
    FROM identity.users users
    LEFT JOIN latest_subscription ON latest_subscription.user_id = users.id
    WHERE users.status <> 'deleted'
    GROUP BY COALESCE(latest_subscription.plan_id, 'free')
    ORDER BY users DESC
  `.execute(db);

  return rows.rows.map((row) => ({
    planId: row.plan_id,
    users: toInt(row.users),
  }));
}

async function serviceBoundaryHealth(db: Db, config: ReturnType<typeof loadConfig>) {
  const rows = await db
    .selectFrom("platform.outbox_events")
    .select(["topic", "status", sql<number>`COUNT(*)::integer`.as("count")])
    .groupBy(["topic", "status"])
    .execute();
  const topicStatusCounts = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const current = topicStatusCounts.get(row.topic) ?? {};
    current[row.status] = toInt(row.count);
    topicStatusCounts.set(row.topic, current);
  }

  const boundaries = [
    boundary(
      "api-gateway",
      "Public API and active orchestration path",
      config.API_GATEWAY_PORT,
      [],
      `http://127.0.0.1:${config.API_GATEWAY_PORT}`,
    ),
    boundary(
      "identity-service",
      "Email auth and account identity",
      config.IDENTITY_SERVICE_PORT,
      ["identity.email.verified"],
      config.IDENTITY_SERVICE_URL,
    ),
    boundary(
      "risk-service",
      "Risk scoring and abuse control",
      config.RISK_SERVICE_PORT,
      ["risk.session.scored"],
      config.RISK_SERVICE_URL,
    ),
    boundary(
      "chat-orchestrator",
      "Chat turn planning and model routing",
      config.CHAT_ORCHESTRATOR_PORT,
      ["chat.turn.created", "chat.turn.completed"],
      config.CHAT_ORCHESTRATOR_URL,
    ),
    boundary(
      "memory-service",
      "Memory scoring and write policy",
      config.MEMORY_SERVICE_PORT,
      [
        "memory.extraction.requested",
        "memory.qdrant.upsert.requested",
        "memory.neo4j.upsert.requested",
        "memory.snapshot.requested",
      ],
      config.MEMORY_SERVICE_URL,
    ),
    boundary(
      "retrieval-service",
      "Memory and character reranking",
      config.RETRIEVAL_SERVICE_PORT,
      ["creator.character.qdrant.upsert.requested"],
      config.RETRIEVAL_SERVICE_URL,
    ),
    boundary(
      "graph-service",
      "Neo4j relationship projection",
      config.GRAPH_SERVICE_PORT,
      ["memory.neo4j.upsert.requested", "creator.character.neo4j.upsert.requested"],
      config.GRAPH_SERVICE_URL,
    ),
    boundary(
      "moderation-service",
      "Safety classification and review",
      config.MODERATION_SERVICE_PORT,
      ["moderation.review.requested"],
      config.MODERATION_SERVICE_URL,
    ),
    boundary(
      "billing-service",
      "Checkout, webhooks, wallets, payouts",
      config.BILLING_SERVICE_PORT,
      ["billing.usage.metered"],
      config.BILLING_SERVICE_URL,
    ),
    boundary(
      "creator-service",
      "Character marketplace and publishing",
      config.CREATOR_SERVICE_PORT,
      ["creator.character.qdrant.upsert.requested", "creator.character.neo4j.upsert.requested"],
      config.CREATOR_SERVICE_URL,
    ),
    boundary(
      "notification-service",
      "Email and push delivery",
      config.NOTIFICATION_SERVICE_PORT,
      ["notification.delivery.requested"],
      config.NOTIFICATION_SERVICE_URL,
    ),
    boundary(
      "batch-orchestrator",
      "Outbox leases and batch coordination",
      config.BATCH_ORCHESTRATOR_PORT,
      [],
      config.BATCH_ORCHESTRATOR_URL,
    ),
    boundary(
      "worker-service",
      "Qdrant, Neo4j, and ClickHouse projections",
      config.WORKER_SERVICE_PORT,
      [
        "analytics.event.created",
        "memory.qdrant.upsert.requested",
        "memory.neo4j.upsert.requested",
        "memory.snapshot.requested",
        "creator.character.qdrant.upsert.requested",
        "creator.character.neo4j.upsert.requested",
      ],
      config.WORKER_SERVICE_URL,
    ),
  ];
  const healthChecks = await Promise.all(
    boundaries.map((item) => checkServiceHealth(new URL("/health", item.healthUrl).toString())),
  );

  return boundaries.map((item, index) => {
    const openEvents = item.topics.reduce((sum, topic) => {
      const statuses = topicStatusCounts.get(topic) ?? {};

      return (
        sum + (statuses["pending"] ?? 0) + (statuses["failed"] ?? 0) + (statuses["processing"] ?? 0)
      );
    }, 0);
    const deadLetters = item.topics.reduce((sum, topic) => {
      const statuses = topicStatusCounts.get(topic) ?? {};

      return sum + (statuses["dead_letter"] ?? 0);
    }, 0);
    const health = healthChecks[index] ?? {
      healthStatus: "degraded" as const,
      healthLatencyMs: 0,
      healthDetail: "health check did not run",
    };

    return {
      name: item.name,
      role: item.role,
      port: item.port,
      topics: item.topics,
      openEvents,
      deadLetters,
      ...health,
      status:
        health.healthStatus === "degraded" || deadLetters > 0
          ? "needs_attention"
          : openEvents > 50
            ? "backlog"
            : "ready",
    };
  });
}

async function checkServiceHealth(url: string): Promise<{
  healthStatus: ServiceHealthStatus;
  healthLatencyMs: number;
  healthDetail?: string;
}> {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    const payload = (await response.json().catch(() => null)) as { status?: unknown } | null;
    const reportedStatus = payload?.status === "degraded" ? "degraded" : "ok";
    const healthStatus = response.ok && reportedStatus === "ok" ? "ok" : "degraded";

    return {
      healthStatus,
      healthLatencyMs: Date.now() - startedAt,
      ...(healthStatus === "degraded"
        ? { healthDetail: response.ok ? "service reported degraded" : `HTTP ${response.status}` }
        : {}),
    };
  } catch (error) {
    return {
      healthStatus: "degraded",
      healthLatencyMs: Date.now() - startedAt,
      healthDetail: error instanceof Error ? error.message : "health check failed",
    };
  }
}

function boundary(
  name: string,
  role: string,
  port: number,
  topics: string[],
  healthUrl: string,
): ServiceBoundary {
  return {
    name,
    role,
    port,
    topics,
    healthUrl,
  };
}

function daysAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 86_400_000);
}

function startOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

function toInt(value: unknown): number {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.trunc(parsed);
}

function toFloat(value: unknown): number {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Number(parsed.toFixed(6));
}
