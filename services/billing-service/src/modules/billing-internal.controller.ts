import { loadConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import { Controller, Get, OnModuleDestroy, Param } from "@nestjs/common";

@Controller("/internal/billing")
export class BillingInternalController implements OnModuleDestroy {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  public async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }

  @Get("/users/:userId/entitlements")
  public async entitlements(@Param("userId") userId: string) {
    const subscription = await this.db
      .selectFrom("billing.subscriptions as subscriptions")
      .innerJoin("billing.plans as plans", "plans.id", "subscriptions.plan_id")
      .select([
        "plans.id",
        "plans.monthly_message_limit",
        "plans.deep_memory_enabled",
        "plans.voice_enabled",
        "plans.adult_mode_enabled",
        "plans.creator_paid_characters_enabled",
      ])
      .where("subscriptions.user_id", "=", userId)
      .where("subscriptions.status", "in", ["active", "trialing"])
      .where("subscriptions.current_period_end", ">", new Date())
      .orderBy("subscriptions.current_period_end", "desc")
      .executeTakeFirst();

    if (subscription) {
      return {
        planId: subscription.id,
        monthlyMessageLimit: subscription.monthly_message_limit,
        dailyMessageLimit: null,
        deepMemoryEnabled: subscription.deep_memory_enabled,
        voiceEnabled: subscription.voice_enabled,
        adultModeEnabled: subscription.adult_mode_enabled,
        creatorPaidCharactersEnabled: subscription.creator_paid_characters_enabled,
      };
    }

    const freePlan = await this.db
      .selectFrom("billing.plans")
      .select([
        "id",
        "monthly_message_limit",
        "deep_memory_enabled",
        "voice_enabled",
        "adult_mode_enabled",
        "creator_paid_characters_enabled",
      ])
      .where("id", "=", "free")
      .executeTakeFirstOrThrow();

    return {
      planId: freePlan.id,
      monthlyMessageLimit: freePlan.monthly_message_limit,
      dailyMessageLimit: 30,
      deepMemoryEnabled: freePlan.deep_memory_enabled,
      voiceEnabled: freePlan.voice_enabled,
      adultModeEnabled: freePlan.adult_mode_enabled,
      creatorPaidCharactersEnabled: freePlan.creator_paid_characters_enabled,
    };
  }

  @Get("/users/:userId/characters/:characterId/access")
  public async paidCharacterAccess(
    @Param("userId") userId: string,
    @Param("characterId") characterId: string,
  ) {
    const purchase = await this.db
      .selectFrom("billing.character_purchases")
      .select(["id"])
      .where("user_id", "=", userId)
      .where("character_id", "=", characterId)
      .where("status", "=", "paid")
      .executeTakeFirst();

    return {
      hasAccess: Boolean(purchase),
    };
  }
}
