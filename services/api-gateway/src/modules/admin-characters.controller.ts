import { loadConfig } from "@hana/config";
import { AdminReviewCharacterRequestSchema } from "@hana/contracts";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { projectCharacterUpsert } from "./character-projection";
import { auditEvent, requireAdmin } from "./session";

type CharacterReviewAction = "approve" | "reject";

@Controller("/v1/admin/characters")
export class AdminCharactersController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/reviews")
  public async reviews(@Headers("authorization") authorization?: string) {
    await requireAdmin(this.db, this.config, authorization);

    const characters = await this.db
      .selectFrom("creator.characters as characters")
      .innerJoin("identity.users as creators", "creators.id", "characters.creator_user_id")
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
        "characters.avatar_url",
        "characters.cover_image_url",
        "characters.marketplace_category",
        "characters.marketplace_preview",
        "characters.updated_at",
        "creators.display_name as creator_display_name",
        "versions.greeting",
        "versions.rating",
        "versions.tags",
        "versions.personality_traits",
        "versions.speaking_style",
      ])
      .where((eb) =>
        eb.or([
          eb("characters.moderation_status", "=", "pending_review"),
          eb.and([
            eb("characters.moderation_status", "=", "draft"),
            eb("versions.rating", "in", ["mature", "adult"]),
          ]),
        ]),
      )
      .orderBy("characters.updated_at", "asc")
      .limit(100)
      .execute();

    return {
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        creatorName: character.creator_display_name ?? "Creator",
        description: character.description,
        marketplacePreview: character.marketplace_preview ?? character.description,
        category: character.marketplace_category,
        rating: character.rating,
        isAdult: character.rating === "mature" || character.rating === "adult",
        tags: character.tags,
        traits: character.personality_traits,
        speakingStyle: character.speaking_style,
        greeting: character.greeting,
        visibility: character.visibility,
        moderationStatus: character.moderation_status,
        avatarUrl: character.avatar_url,
        coverImageUrl: character.cover_image_url,
        updatedAt: character.updated_at.toISOString(),
      })),
    };
  }

  @Post("/:characterId/review")
  public async review(
    @Param("characterId") characterId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const admin = await requireAdmin(this.db, this.config, authorization);
    const input = AdminReviewCharacterRequestSchema.parse(body);
    const now = new Date();

    const reviewed = await this.db.transaction().execute(async (tx) => {
      const character = await tx
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
        .where("characters.id", "=", characterId)
        .forUpdate()
        .executeTakeFirst();

      if (!character) {
        throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
      }

      const state = reviewState(input.action, now);

      await tx
        .updateTable("creator.characters")
        .set({
          visibility: state.visibility,
          moderation_status: state.moderationStatus,
          published_at: state.publishedAt,
          updated_at: now,
        })
        .where("id", "=", character.id)
        .execute();

      return {
        ...character,
        visibility: state.visibility,
        moderation_status: state.moderationStatus,
        published_at: state.publishedAt,
        updated_at: now,
        previousVisibility: character.visibility,
        previousModerationStatus: character.moderation_status,
      };
    });

    await projectCharacterUpsert({
      db: this.db,
      config: this.config,
      actorUserId: admin.userId,
      action: "review",
      character: {
        id: reviewed.id,
        creatorUserId: reviewed.creator_user_id,
        name: reviewed.name,
        description: reviewed.description,
        personaPrompt: reviewed.persona_prompt,
        greeting: reviewed.greeting,
        scenarioPrompt: reviewed.scenario_prompt,
        speakingStyle: reviewed.speaking_style,
        personalityTraits: reviewed.personality_traits,
        marketplaceCategory: reviewed.marketplace_category,
        modelProfile: reviewed.model_profile,
        visibility: reviewed.visibility,
        moderationStatus: reviewed.moderation_status,
        rating: reviewed.rating,
        tags: reviewed.tags,
        priceCents: reviewed.price_cents,
        monetizationEnabled: this.config.MONETIZATION_ENABLED && reviewed.monetization_enabled,
        updatedAt: now,
      },
    });

    await auditEvent(this.db, {
      actorUserId: admin.userId,
      action: `admin.character.${input.action}`,
      resourceType: "creator.character",
      resourceId: reviewed.id,
      metadata: {
        note: input.note,
        rating: reviewed.rating,
        previousVisibility: reviewed.previousVisibility,
        previousModerationStatus: reviewed.previousModerationStatus,
        visibility: reviewed.visibility,
        moderationStatus: reviewed.moderation_status,
      },
    });

    return {
      ok: true,
      characterId: reviewed.id,
      action: input.action,
      visibility: reviewed.visibility,
      moderationStatus: reviewed.moderation_status,
      published: reviewed.visibility === "public" && reviewed.moderation_status === "approved",
    };
  }
}

function reviewState(action: CharacterReviewAction, now: Date) {
  if (action === "approve") {
    return {
      visibility: "public" as const,
      moderationStatus: "approved" as const,
      publishedAt: now,
    };
  }

  return {
    visibility: "private" as const,
    moderationStatus: "rejected" as const,
    publishedAt: null,
  };
}
