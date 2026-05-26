import { loadConfig, type AppConfig } from "@hana/config";
import {
  CreateCharacterRequestSchema,
  PublishCharacterRequestSchema,
  RateCharacterRequestSchema,
  RecordCharacterEventRequestSchema,
  type CreateCharacterRequest,
  type CharacterRating,
} from "@hana/contracts";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { classifyTextSafety } from "@hana/safety-core";
import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { Kysely, sql } from "kysely";
import { randomUUID } from "node:crypto";
import { projectCharacterUpsert } from "./character-projection";
import {
  DEFAULT_MARKETPLACE_STATS,
  applyMarketplaceRatingAggregate,
  incrementMarketplaceStats,
  normalizeMarketplaceStats,
} from "./marketplace-stats";
import { hasPaidCharacterAccess, paidCharacterTrialStatus } from "./monetization.controller";
import { auditEvent, requireSession } from "./session";
import { searchCharacterVectors } from "./vector-character";

const DEFAULT_AVATAR_URL = "/assets/hana-icon-head.png";
const DEFAULT_COVER_IMAGE_URL = "/assets/hana-hero.png";

interface MarketplaceViewer {
  userId: string;
  adultContentEnabled: boolean;
}

@Controller("/v1/characters")
export class CharactersController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/recommended")
  public async recommended() {
    await ensureDefaultCharacter(this.db);

    return {
      characters: await listMarketplaceCharacters(this.db, { config: this.config }),
    };
  }

  @Get("/marketplace")
  public async marketplace(
    @Query("query") query?: string,
    @Headers("authorization") authorization?: string,
  ) {
    await ensureDefaultCharacter(this.db);
    const viewer = await resolveMarketplaceViewer(this.db, this.config, authorization);

    return {
      characters: await listMarketplaceCharacters(this.db, {
        config: this.config,
        query,
        viewer,
      }),
    };
  }

  @Get("/mine")
  public async mine(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const characters = await this.db
      .selectFrom("creator.characters as characters")
      .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
      .leftJoin(
        "creator.character_versions as versions",
        "versions.id",
        "characters.current_version_id",
      )
      .select([
        "characters.id",
        "characters.creator_user_id",
        "creators.display_name as creator_display_name",
        "creators.avatar_url as creator_avatar_url",
        "characters.name",
        "characters.description",
        "characters.visibility",
        "characters.moderation_status",
        "characters.slug",
        "characters.avatar_url",
        "characters.cover_image_url",
        "characters.template_id",
        "characters.marketplace_category",
        "characters.marketplace_preview",
        "characters.model_profile",
        "characters.price_cents",
        "characters.monetization_enabled",
        "characters.marketplace_stats_json",
        "versions.greeting",
        "versions.rating",
        "versions.tags",
        "versions.personality_traits",
        "versions.speaking_style",
        "characters.updated_at",
      ])
      .where("characters.creator_user_id", "=", session.userId)
      .orderBy("characters.updated_at", "desc")
      .execute();

    return {
      characters: characters.map((character) =>
        toCharacterSummary(character, {
          monetizationEnabled: this.config.MONETIZATION_ENABLED,
        }),
      ),
    };
  }

  @Get("/:characterId")
  public async detail(
    @Param("characterId") characterId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const character = await this.db
      .selectFrom("creator.characters as characters")
      .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
      .innerJoin(
        "creator.character_versions as versions",
        "versions.id",
        "characters.current_version_id",
      )
      .select([
        "characters.id",
        "characters.creator_user_id",
        "creators.display_name as creator_display_name",
        "creators.avatar_url as creator_avatar_url",
        "characters.name",
        "characters.description",
        "characters.visibility",
        "characters.moderation_status",
        "characters.slug",
        "characters.avatar_url",
        "characters.cover_image_url",
        "characters.template_id",
        "characters.marketplace_category",
        "characters.marketplace_preview",
        "characters.model_profile",
        "characters.price_cents",
        "characters.monetization_enabled",
        "characters.marketplace_stats_json",
        "versions.greeting",
        "versions.rating",
        "versions.tags",
        "versions.personality_traits",
        "versions.speaking_style",
        "characters.updated_at",
      ])
      .where("characters.id", "=", characterId)
      .executeTakeFirst();

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    const isCreator = character.creator_user_id === session.userId;
    const isPublicApproved =
      character.visibility === "public" && character.moderation_status === "approved";
    const isDefaultMarketplaceSafe = character.rating === "general" || character.rating === "teen";

    if (!isCreator && (!isPublicApproved || !isDefaultMarketplaceSafe)) {
      throw new DomainError("AUTH_FORBIDDEN", "Character is not available");
    }

    const access =
      this.config.MONETIZATION_ENABLED &&
      character.monetization_enabled &&
      character.price_cents > 0 &&
      character.creator_user_id !== session.userId
        ? await resolvePaidAccessStatus(this.db, this.config, {
            userId: session.userId,
            characterId: character.id,
          })
        : {
            type: character.creator_user_id === session.userId ? "creator" : "free",
            unlocked: true,
            trialLimit: this.config.CREATOR_PAID_CHARACTER_TRIAL_MESSAGES,
            trialUsed: 0,
            trialRemaining: this.config.CREATOR_PAID_CHARACTER_TRIAL_MESSAGES,
          };

    return {
      character: {
        ...toCharacterSummary(character, {
          monetizationEnabled: this.config.MONETIZATION_ENABLED,
        }),
        greeting: character.greeting,
        access,
      },
    };
  }

  @Post()
  public async create(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateCharacterRequestSchema.parse(body);
    assertCharacterSafety(input);

    const now = new Date();
    const moderationStatus = input.isPrivate ? "draft" : moderationStatusForRating(input.rating);
    const visibility = !input.isPrivate && moderationStatus === "approved" ? "public" : "private";
    const publishedAt = visibility === "public" ? now : null;
    const character = await this.db
      .insertInto("creator.characters")
      .values({
        creator_user_id: session.userId,
        name: input.name,
        description: input.description,
        visibility,
        moderation_status: moderationStatus,
        slug: uniqueSlug(input.name),
        avatar_url: input.avatarUrl || DEFAULT_AVATAR_URL,
        cover_image_url: input.coverImageUrl || DEFAULT_COVER_IMAGE_URL,
        template_id: input.templateId,
        marketplace_category: input.marketplaceCategory,
        marketplace_preview: input.marketplacePreview || input.description,
        model_profile: input.modelProfile,
        price_cents: input.priceCents,
        monetization_enabled:
          this.config.MONETIZATION_ENABLED && input.monetizationEnabled && input.priceCents > 0,
        published_at: publishedAt,
        marketplace_stats_json: DEFAULT_MARKETPLACE_STATS,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const version = await this.db
      .insertInto("creator.character_versions")
      .values({
        character_id: character.id,
        version: 1,
        name: input.name,
        description: input.description,
        persona_prompt: input.personaPrompt,
        greeting: input.greeting,
        scenario_prompt: input.scenarioPrompt || null,
        first_message_style: input.firstMessageStyle || null,
        creator_notes: input.creatorNotes || null,
        personality_traits: input.personalityTraits,
        speaking_style: input.speakingStyle || null,
        memory_scope: "conversation",
        example_dialogues_json: input.exampleDialogues,
        rating: input.rating,
        tags: input.tags,
        created_by: session.userId,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await this.db
      .updateTable("creator.characters")
      .set({ current_version_id: version.id, updated_at: now })
      .where("id", "=", character.id)
      .execute();

    await projectCharacterUpsert({
      db: this.db,
      config: this.config,
      actorUserId: session.userId,
      action: "create",
      character: {
        id: character.id,
        creatorUserId: session.userId,
        name: input.name,
        description: input.description,
        personaPrompt: input.personaPrompt,
        greeting: input.greeting,
        scenarioPrompt: input.scenarioPrompt,
        speakingStyle: input.speakingStyle,
        personalityTraits: input.personalityTraits,
        marketplaceCategory: input.marketplaceCategory,
        modelProfile: input.modelProfile,
        visibility,
        moderationStatus,
        rating: input.rating,
        tags: input.tags,
        priceCents: input.priceCents,
        monetizationEnabled:
          this.config.MONETIZATION_ENABLED && input.monetizationEnabled && input.priceCents > 0,
        updatedAt: now,
      },
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "character.create",
      resourceType: "creator.character",
      resourceId: character.id,
      metadata: { rating: input.rating, isPrivate: input.isPrivate },
    });

    return {
      id: character.id,
      version: 1,
      status: moderationStatus,
      visibility,
      character: {
        ...input,
        monetizationEnabled:
          this.config.MONETIZATION_ENABLED && input.monetizationEnabled && input.priceCents > 0,
      },
    };
  }

  @Post("/:characterId/publish")
  public async publish(
    @Param("characterId") characterId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = PublishCharacterRequestSchema.parse({
      ...(typeof body === "object" && body ? body : {}),
      characterId,
    });
    const character = await this.db
      .selectFrom("creator.characters as characters")
      .innerJoin(
        "creator.character_versions as versions",
        "versions.id",
        "characters.current_version_id",
      )
      .select([
        "characters.id",
        "characters.creator_user_id",
        "characters.name",
        "characters.description",
        "characters.marketplace_category",
        "characters.model_profile",
        "characters.price_cents",
        "characters.monetization_enabled",
        "versions.persona_prompt",
        "versions.greeting",
        "versions.scenario_prompt",
        "versions.speaking_style",
        "versions.personality_traits",
        "versions.rating",
        "versions.tags",
      ])
      .where("characters.id", "=", input.characterId)
      .executeTakeFirst();

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    if (character.creator_user_id !== session.userId) {
      throw new DomainError("AUTH_FORBIDDEN", "Only the creator can publish this character");
    }

    const moderationStatus = moderationStatusForRating(character.rating);
    const visibility = moderationStatus === "approved" ? "public" : "private";
    const now = new Date();

    await this.db
      .updateTable("creator.characters")
      .set({
        visibility,
        moderation_status: moderationStatus,
        published_at: moderationStatus === "approved" ? now : null,
        price_cents: input.priceCents ?? character.price_cents,
        monetization_enabled:
          this.config.MONETIZATION_ENABLED &&
          (input.monetizationEnabled ?? character.monetization_enabled),
        updated_at: now,
      })
      .where("id", "=", character.id)
      .execute();

    await projectCharacterUpsert({
      db: this.db,
      config: this.config,
      actorUserId: session.userId,
      action: "publish",
      character: {
        id: character.id,
        creatorUserId: character.creator_user_id,
        name: character.name,
        description: character.description,
        personaPrompt: character.persona_prompt,
        greeting: character.greeting,
        scenarioPrompt: character.scenario_prompt,
        speakingStyle: character.speaking_style,
        personalityTraits: character.personality_traits,
        marketplaceCategory: character.marketplace_category,
        modelProfile: character.model_profile,
        visibility,
        moderationStatus,
        rating: character.rating,
        tags: character.tags,
        priceCents: input.priceCents ?? character.price_cents,
        monetizationEnabled:
          this.config.MONETIZATION_ENABLED &&
          (input.monetizationEnabled ?? character.monetization_enabled),
        updatedAt: now,
      },
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "character.publish",
      resourceType: "creator.character",
      resourceId: character.id,
      metadata: { moderationStatus, marketplaceNotes: input.marketplaceNotes },
    });

    return {
      id: character.id,
      name: character.name,
      visibility,
      moderationStatus,
      published: moderationStatus === "approved",
    };
  }

  @Post("/:characterId/events")
  public async recordEvent(
    @Param("characterId") characterId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = RecordCharacterEventRequestSchema.parse(body);
    const character = await this.db
      .selectFrom("creator.characters")
      .select(["id", "creator_user_id", "visibility", "moderation_status"])
      .where("id", "=", characterId)
      .executeTakeFirst();

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    if (character.visibility !== "public" && character.creator_user_id !== session.userId) {
      throw new DomainError("AUTH_FORBIDDEN", "Character is private");
    }

    if (
      character.moderation_status !== "approved" &&
      character.creator_user_id !== session.userId
    ) {
      throw new DomainError("AUTH_FORBIDDEN", "Character is not approved");
    }

    const stats = await incrementMarketplaceStats(
      this.db,
      character.id,
      input.type,
      session.userId,
    );

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: `character.marketplace.${input.type}`,
      resourceType: "creator.character",
      resourceId: character.id,
      metadata: { stats },
    });

    return { stats };
  }

  @Post("/:characterId/rating")
  public async rateCharacter(
    @Param("characterId") characterId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = RateCharacterRequestSchema.parse(body);

    const stats = await this.db.transaction().execute(async (trx) => {
      const character = await trx
        .selectFrom("creator.characters")
        .select([
          "id",
          "creator_user_id",
          "visibility",
          "moderation_status",
          "marketplace_stats_json",
        ])
        .where("id", "=", characterId)
        .forUpdate()
        .executeTakeFirst();

      if (!character) {
        throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
      }

      if (character.creator_user_id === session.userId) {
        throw new DomainError("CONFLICT", "Creators cannot rate their own character");
      }

      if (character.visibility !== "public" || character.moderation_status !== "approved") {
        throw new DomainError("AUTH_FORBIDDEN", "Character is not available for ratings");
      }

      const now = new Date();

      await trx
        .insertInto("creator.character_ratings")
        .values({
          character_id: character.id,
          user_id: session.userId,
          score: input.score,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.columns(["character_id", "user_id"]).doUpdateSet({
            score: input.score,
            updated_at: now,
          }),
        )
        .execute();

      const aggregate = await trx
        .selectFrom("creator.character_ratings")
        .select([
          sql<number>`COUNT(*)::integer`.as("rating_count"),
          sql<number>`COALESCE(ROUND(AVG(score)::numeric, 2), 0)::double precision`.as(
            "rating_average",
          ),
        ])
        .where("character_id", "=", character.id)
        .executeTakeFirstOrThrow();

      const nextStats = applyMarketplaceRatingAggregate(
        normalizeMarketplaceStats(character.marketplace_stats_json),
        {
          ratingAverage: Number(aggregate.rating_average),
          ratingCount: Number(aggregate.rating_count),
        },
      );

      await trx
        .updateTable("creator.characters")
        .set({
          marketplace_stats_json: nextStats,
          updated_at: now,
        })
        .where("id", "=", character.id)
        .execute();

      return nextStats;
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "character.rating.upsert",
      resourceType: "creator.character",
      resourceId: characterId,
      metadata: { score: input.score, ratingAverage: stats.ratingAverage },
    });

    return { score: input.score, stats };
  }
}

async function ensureDefaultCharacter(db: Kysely<HanaDatabase>): Promise<void> {
  const existingPublicCharacter = await db
    .selectFrom("creator.characters")
    .select("id")
    .where("visibility", "=", "public")
    .where("moderation_status", "=", "approved")
    .executeTakeFirst();

  if (existingPublicCharacter) {
    return;
  }

  const existing = await db
    .selectFrom("creator.characters")
    .select(["id", "marketplace_stats_json"])
    .where("slug", "=", "hana")
    .executeTakeFirst();

  if (existing) {
    await resetLegacySeedStatsIfNeeded(db, existing.id, existing.marketplace_stats_json);
    return;
  }

  const systemUser = await db
    .insertInto("identity.users")
    .values({ display_name: "Hana Studio", status: "active" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  const character = await db
    .insertInto("creator.characters")
    .values({
      creator_user_id: systemUser.id,
      name: "Hana",
      description: "Cinematic romance with sharp memory and restrained emotional tension.",
      visibility: "public",
      moderation_status: "approved",
      slug: "hana",
      avatar_url: DEFAULT_AVATAR_URL,
      cover_image_url: DEFAULT_COVER_IMAGE_URL,
      template_id: "soft-romance",
      marketplace_category: "romance",
      marketplace_preview: "A cinematic companion who remembers the quiet details.",
      model_profile: "balanced",
      price_cents: 0,
      monetization_enabled: false,
      published_at: new Date(),
      marketplace_stats_json: DEFAULT_MARKETPLACE_STATS,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  const version = await db
    .insertInto("creator.character_versions")
    .values({
      character_id: character.id,
      version: 1,
      name: "Hana",
      description: "Cinematic romance with sharp memory and restrained emotional tension.",
      persona_prompt:
        "You are Hana, an anime-inspired companion. Stay emotionally consistent, remember context, avoid explicit sexual content unless policy and settings allow it, and focus on cinematic, intimate roleplay.",
      greeting: "You came back. I kept your place in the story.",
      scenario_prompt: "A quiet late-night chat where every return feels like continuity.",
      first_message_style: "warm, restrained, intimate",
      creator_notes: "Flagship system character used to seed discovery and chat.",
      personality_traits: ["cinematic", "observant", "warm", "loyal"],
      speaking_style: "soft-spoken, emotionally specific, never generic",
      memory_scope: "conversation",
      example_dialogues_json: [],
      rating: "teen",
      tags: ["anime", "romance", "memory"],
      created_by: systemUser.id,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  await db
    .updateTable("creator.characters")
    .set({ current_version_id: version.id })
    .where("id", "=", character.id)
    .execute();
}

async function resetLegacySeedStatsIfNeeded(
  db: Kysely<HanaDatabase>,
  characterId: string,
  value: unknown,
): Promise<void> {
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const hasLegacySeedStats =
    Number(record["chats"] ?? 0) === 18420 &&
    Number(record["likes"] ?? 0) === 6420 &&
    !record["lastInteractionAt"];

  if (!hasLegacySeedStats) {
    return;
  }

  await db
    .updateTable("creator.characters")
    .set({ marketplace_stats_json: DEFAULT_MARKETPLACE_STATS })
    .where("id", "=", characterId)
    .execute();
}

async function resolveMarketplaceViewer(
  db: Kysely<HanaDatabase>,
  config: AppConfig,
  authorization: string | undefined,
): Promise<MarketplaceViewer | null> {
  try {
    const session = await requireSession(db, config, authorization);
    const settings = await db
      .selectFrom("identity.user_settings")
      .select(["adult_mode_enabled"])
      .where("user_id", "=", session.userId)
      .executeTakeFirst();

    return {
      userId: session.userId,
      adultContentEnabled: Boolean(settings?.adult_mode_enabled),
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return null;
    }

    throw error;
  }
}

async function listMarketplaceCharacters(
  db: Kysely<HanaDatabase>,
  options?: {
    config?: ReturnType<typeof loadConfig>;
    query?: string | undefined;
    viewer?: MarketplaceViewer | null;
  },
) {
  const query = options?.query?.trim();
  const viewer = options?.viewer ?? null;

  if (query && options?.config) {
    try {
      const vectorHits = await searchCharacterVectors(options.config, {
        query,
        limit: 24,
      });
      const characterIds = vectorHits.map((hit) => hit.characterId);

      if (characterIds.length > 0) {
        const vectorCharacters = await listMarketplaceCharactersByIds(db, characterIds, {
          monetizationEnabled: options.config.MONETIZATION_ENABLED,
          viewer,
        });
        const ownCharacters = viewer ? await listOwnMarketplaceCharacters(db, viewer, query) : [];

        if (ownCharacters.length === 0) {
          return vectorCharacters;
        }

        const ownSummaries = ownCharacters.map((character) =>
          toCharacterSummary(character, {
            monetizationEnabled: options.config?.MONETIZATION_ENABLED ?? true,
          }),
        );

        return dedupeMarketplaceItems([...ownSummaries, ...vectorCharacters]);
      }
    } catch {
      // Qdrant is the discovery index; Postgres remains canonical when the index is warming.
    }
  }

  let publicQuery = db
    .selectFrom("creator.characters as characters")
    .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
    .innerJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .select([
      "characters.id",
      "characters.creator_user_id",
      "creators.display_name as creator_display_name",
      "creators.avatar_url as creator_avatar_url",
      "characters.name",
      "characters.description",
      "characters.visibility",
      "characters.moderation_status",
      "characters.slug",
      "characters.avatar_url",
      "characters.cover_image_url",
      "characters.template_id",
      "characters.marketplace_category",
      "characters.marketplace_preview",
      "characters.model_profile",
      "characters.price_cents",
      "characters.monetization_enabled",
      "characters.marketplace_stats_json",
      "versions.rating",
      "versions.tags",
      "versions.personality_traits",
      "versions.speaking_style",
      "characters.updated_at",
    ])
    .where("characters.visibility", "=", "public")
    .where("characters.moderation_status", "=", "approved")
    .orderBy(
      sql<number>`COALESCE((characters.marketplace_stats_json->>'trendingScore')::DOUBLE PRECISION, 0)`,
      "desc",
    )
    .orderBy("characters.published_at", "desc")
    .orderBy("characters.updated_at", "desc")
    .limit(24);

  if (!viewer?.adultContentEnabled) {
    publicQuery = publicQuery.where("versions.rating", "in", ["general", "teen"]);
  }

  if (query) {
    const pattern = `%${query}%`;
    publicQuery = publicQuery.where((eb) =>
      eb.or([
        eb("characters.name", "ilike", pattern),
        eb("characters.description", "ilike", pattern),
        eb("characters.marketplace_preview", "ilike", pattern),
        sql<boolean>`array_to_string(versions.tags, ' ') ilike ${pattern}`,
      ]),
    );
  }

  const publicCharacters = await publicQuery.execute();
  const ownCharacters = viewer ? await listOwnMarketplaceCharacters(db, viewer, query) : [];
  const characters = dedupeMarketplaceItems([...ownCharacters, ...publicCharacters]);

  return characters.map((character) =>
    toCharacterSummary(character, {
      monetizationEnabled: options?.config?.MONETIZATION_ENABLED ?? true,
    }),
  );
}

async function listMarketplaceCharactersByIds(
  db: Kysely<HanaDatabase>,
  characterIds: string[],
  options: { monetizationEnabled: boolean; viewer?: MarketplaceViewer | null },
) {
  const characters = await db
    .selectFrom("creator.characters as characters")
    .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
    .innerJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .select([
      "characters.id",
      "characters.creator_user_id",
      "creators.display_name as creator_display_name",
      "creators.avatar_url as creator_avatar_url",
      "characters.name",
      "characters.description",
      "characters.visibility",
      "characters.moderation_status",
      "characters.slug",
      "characters.avatar_url",
      "characters.cover_image_url",
      "characters.template_id",
      "characters.marketplace_category",
      "characters.marketplace_preview",
      "characters.model_profile",
      "characters.price_cents",
      "characters.monetization_enabled",
      "characters.marketplace_stats_json",
      "versions.rating",
      "versions.tags",
      "versions.personality_traits",
      "versions.speaking_style",
      "characters.updated_at",
    ])
    .where("characters.id", "in", characterIds)
    .execute();
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is NonNullable<ReturnType<typeof characterById.get>> =>
      Boolean(character),
    )
    .filter((character) => isVisibleInMarketplace(character, options.viewer ?? null))
    .map((character) => toCharacterSummary(character, options));
}

async function listOwnMarketplaceCharacters(
  db: Kysely<HanaDatabase>,
  viewer: MarketplaceViewer,
  query: string | undefined,
) {
  let ownQuery = db
    .selectFrom("creator.characters as characters")
    .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
    .innerJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .select([
      "characters.id",
      "characters.creator_user_id",
      "creators.display_name as creator_display_name",
      "creators.avatar_url as creator_avatar_url",
      "characters.name",
      "characters.description",
      "characters.visibility",
      "characters.moderation_status",
      "characters.slug",
      "characters.avatar_url",
      "characters.cover_image_url",
      "characters.template_id",
      "characters.marketplace_category",
      "characters.marketplace_preview",
      "characters.model_profile",
      "characters.price_cents",
      "characters.monetization_enabled",
      "characters.marketplace_stats_json",
      "versions.rating",
      "versions.tags",
      "versions.personality_traits",
      "versions.speaking_style",
      "characters.updated_at",
    ])
    .where("characters.creator_user_id", "=", viewer.userId)
    .orderBy("characters.updated_at", "desc")
    .limit(24);

  if (!viewer.adultContentEnabled) {
    ownQuery = ownQuery.where("versions.rating", "in", ["general", "teen"]);
  }

  if (query) {
    const pattern = `%${query}%`;
    ownQuery = ownQuery.where((eb) =>
      eb.or([
        eb("characters.name", "ilike", pattern),
        eb("characters.description", "ilike", pattern),
        eb("characters.marketplace_preview", "ilike", pattern),
        sql<boolean>`array_to_string(versions.tags, ' ') ilike ${pattern}`,
      ]),
    );
  }

  return ownQuery.execute();
}

type MarketplaceCharacterRow = Awaited<ReturnType<typeof listOwnMarketplaceCharacters>>[number];

function dedupeMarketplaceItems<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }

    seen.add(row.id);
    deduped.push(row);
  }

  return deduped;
}

function isVisibleInMarketplace(
  character: MarketplaceCharacterRow,
  viewer: MarketplaceViewer | null,
): boolean {
  const publicApproved =
    character.visibility === "public" && character.moderation_status === "approved";
  const ownedByViewer = Boolean(viewer && character.creator_user_id === viewer.userId);
  const safeRating = character.rating === "general" || character.rating === "teen";

  if (safeRating) {
    return publicApproved || ownedByViewer;
  }

  if (!viewer?.adultContentEnabled) {
    return false;
  }

  return publicApproved || ownedByViewer;
}

function toCharacterSummary(character: {
  id: string;
  creator_user_id: string;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  name: string;
  description: string;
  visibility: string;
  moderation_status: string;
  slug: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  template_id: string | null;
  marketplace_category: string;
  marketplace_preview: string | null;
  model_profile: string;
  price_cents: number;
  monetization_enabled: boolean;
  marketplace_stats_json: unknown;
  rating: CharacterRating | null;
  tags: string[] | null;
  personality_traits: string[] | null;
  speaking_style: string | null;
  updated_at: Date;
}, options?: { monetizationEnabled?: boolean }) {
  const monetizationEnabled =
    (options?.monetizationEnabled ?? true) &&
    character.monetization_enabled &&
    character.price_cents > 0;

  return {
    id: character.id,
    creator: {
      id: character.creator_user_id,
      displayName: character.creator_display_name ?? "Creator",
      avatarUrl: character.creator_avatar_url ?? null,
    },
    name: character.name,
    description: character.description,
    visibility: character.visibility,
    moderationStatus: character.moderation_status,
    slug: character.slug,
    avatarUrl: character.avatar_url ?? DEFAULT_AVATAR_URL,
    coverImageUrl: character.cover_image_url ?? DEFAULT_COVER_IMAGE_URL,
    templateId: character.template_id ?? "blank",
    marketplaceCategory: character.marketplace_category,
    marketplacePreview: character.marketplace_preview ?? character.description,
    modelProfile: character.model_profile,
    priceCents: monetizationEnabled ? character.price_cents : 0,
    monetizationEnabled,
    marketplaceStats: normalizeMarketplaceStats(character.marketplace_stats_json),
    rating: character.rating,
    tags: character.tags ?? [],
    personalityTraits: character.personality_traits ?? [],
    speakingStyle: character.speaking_style ?? null,
    updatedAt: character.updated_at.toISOString(),
  };
}

async function resolvePaidAccessStatus(
  db: Kysely<HanaDatabase>,
  config: AppConfig,
  input: { userId: string; characterId: string },
) {
  const purchased = await hasPaidCharacterAccess(db, input.userId, input.characterId);

  if (purchased) {
    return {
      type: "purchased",
      unlocked: true,
      trialLimit: config.CREATOR_PAID_CHARACTER_TRIAL_MESSAGES,
      trialUsed: config.CREATOR_PAID_CHARACTER_TRIAL_MESSAGES,
      trialRemaining: 0,
    };
  }

  const trial = await paidCharacterTrialStatus(db, config, input.userId, input.characterId);

  return {
    type: trial.remaining > 0 ? "trial" : "locked",
    unlocked: trial.remaining > 0,
    trialLimit: trial.limit,
    trialUsed: trial.used,
    trialRemaining: trial.remaining,
  };
}

function moderationStatusForRating(rating: CharacterRating): "approved" | "pending_review" {
  return rating === "general" || rating === "teen" ? "approved" : "pending_review";
}

function assertCharacterSafety(input: CreateCharacterRequest): void {
  const text = [
    input.name,
    input.description,
    input.greeting,
    input.personaPrompt,
    input.scenarioPrompt,
    input.creatorNotes,
    input.speakingStyle,
    ...input.personalityTraits,
    ...input.exampleDialogues,
    ...input.tags,
  ]
    .filter(Boolean)
    .join("\n");
  const decision = classifyTextSafety(text, {
    adultModeEnabled: input.rating === "mature" || input.rating === "adult",
    userIsAdult: true,
    characterRating: input.rating,
  });

  if (decision.action !== "allow") {
    throw new DomainError("SAFETY_BLOCKED", "Character content failed safety checks", {
      reasonCode: decision.reasonCode,
      categories: decision.categories,
    });
  }
}

function uniqueSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return `${base || "character"}-${randomUUID().slice(0, 8)}`;
}
