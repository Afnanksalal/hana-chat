import { loadConfig, type AppConfig } from "@hana/config";
import {
  CreateCharacterRequestSchema,
  PublishCharacterRequestSchema,
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
  incrementMarketplaceStats,
  normalizeMarketplaceStats,
} from "./marketplace-stats";
import { hasPaidCharacterAccess, paidCharacterTrialStatus } from "./monetization.controller";
import { auditEvent, requireSession } from "./session";
import { searchCharacterVectors } from "./vector-character";

const DEFAULT_AVATAR_URL = "/assets/hana-icon-head.png";
const DEFAULT_COVER_IMAGE_URL = "/assets/hana-hero.png";

@Controller("/v1/characters")
export class CharactersController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/recommended")
  public async recommended() {
    await ensureDefaultCharacter(this.db);

    return {
      characters: await listMarketplaceCharacters(this.db),
    };
  }

  @Get("/marketplace")
  public async marketplace(@Query("query") query?: string) {
    await ensureDefaultCharacter(this.db);

    return {
      characters: await listMarketplaceCharacters(this.db, {
        config: this.config,
        query,
      }),
    };
  }

  @Get("/mine")
  public async mine(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const characters = await this.db
      .selectFrom("creator.characters as characters")
      .leftJoin(
        "creator.character_versions as versions",
        "versions.id",
        "characters.current_version_id",
      )
      .select([
        "characters.id",
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
      .where("characters.creator_user_id", "=", session.userId)
      .orderBy("characters.updated_at", "desc")
      .execute();

    return { characters: characters.map(toCharacterSummary) };
  }

  @Get("/:characterId")
  public async detail(
    @Param("characterId") characterId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
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

    return { character: { ...toCharacterSummary(character), access } };
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
        monetization_enabled: input.monetizationEnabled && input.priceCents > 0,
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
        monetizationEnabled: input.monetizationEnabled && input.priceCents > 0,
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
      character: input,
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
        monetization_enabled: input.monetizationEnabled ?? character.monetization_enabled,
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
        monetizationEnabled: input.monetizationEnabled ?? character.monetization_enabled,
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

async function listMarketplaceCharacters(
  db: Kysely<HanaDatabase>,
  options?: {
    config?: ReturnType<typeof loadConfig>;
    query?: string | undefined;
  },
) {
  const query = options?.query?.trim();

  if (query && options?.config) {
    try {
      const vectorHits = await searchCharacterVectors(options.config, {
        query,
        limit: 24,
      });
      const characterIds = vectorHits.map((hit) => hit.characterId);

      if (characterIds.length > 0) {
        return listMarketplaceCharactersByIds(db, characterIds);
      }
    } catch {
      // Qdrant is the discovery index; Postgres remains canonical when the index is warming.
    }
  }

  const characters = await db
    .selectFrom("creator.characters as characters")
    .innerJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .select([
      "characters.id",
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
    .where("versions.rating", "in", ["general", "teen"])
    .orderBy(
      sql<number>`COALESCE((characters.marketplace_stats_json->>'trendingScore')::DOUBLE PRECISION, 0)`,
      "desc",
    )
    .orderBy("characters.published_at", "desc")
    .orderBy("characters.updated_at", "desc")
    .limit(24)
    .execute();

  return characters.map(toCharacterSummary);
}

async function listMarketplaceCharactersByIds(db: Kysely<HanaDatabase>, characterIds: string[]) {
  const characters = await db
    .selectFrom("creator.characters as characters")
    .innerJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .select([
      "characters.id",
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
    .where("characters.visibility", "=", "public")
    .where("characters.moderation_status", "=", "approved")
    .where("versions.rating", "in", ["general", "teen"])
    .execute();
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is NonNullable<ReturnType<typeof characterById.get>> =>
      Boolean(character),
    )
    .map(toCharacterSummary);
}

function toCharacterSummary(character: {
  id: string;
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
}) {
  return {
    id: character.id,
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
    priceCents: character.price_cents,
    monetizationEnabled: character.monetization_enabled,
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
