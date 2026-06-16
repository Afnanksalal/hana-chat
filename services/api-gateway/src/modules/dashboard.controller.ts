import { loadConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import { Controller, Get, Headers } from "@nestjs/common";
import { completedUserTurnCount, monthlyBillingWindowStart } from "./billable-messages";
import { requireSession } from "./session";

@Controller("/v1/dashboard")
export class DashboardController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get()
  public async show(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const [settings, plan, messages, memories, characters, conversations, roles] =
      await Promise.all([
        this.db
          .selectFrom("identity.user_settings")
          .selectAll()
          .where("user_id", "=", session.userId)
          .executeTakeFirst(),
        currentPlan(this.db, session.userId),
        monthlyUserMessageCount(this.db, session.userId),
        this.db
          .selectFrom("memory.facts")
          .select(["id"])
          .where("user_id", "=", session.userId)
          .where("is_active", "=", true)
          .execute(),
        this.db
          .selectFrom("creator.characters")
          .select(["id"])
          .where("creator_user_id", "=", session.userId)
          .execute(),
        this.db
          .selectFrom("chat.conversations")
          .select(["id"])
          .where("user_id", "=", session.userId)
          .where("status", "=", "active")
          .execute(),
        this.db
          .selectFrom("identity.user_roles")
          .select(["role"])
          .where("user_id", "=", session.userId)
          .execute(),
      ]);

    return {
      user: {
        id: session.userId,
        displayName: settings?.display_name ?? session.displayName ?? "Hana User",
        roles: roles.map((role) => role.role),
      },
      plan,
      usage: {
        monthlyMessagesUsed: messages,
        monthlyMessagesLimit: plan.monthlyMessageLimit,
        messagesRemaining: Math.max(0, plan.monthlyMessageLimit - messages),
      },
      counts: {
        savedMemories: memories.length,
        createdCharacters: characters.length,
        activeConversations: conversations.length,
      },
      nextAction: conversations.length > 0 ? "Continue your latest chat" : "Start with Hana",
    };
  }
}

async function currentPlan(db: ReturnType<typeof createDatabase>, userId: string) {
  const subscription = await db
    .selectFrom("billing.subscriptions as subscriptions")
    .innerJoin("billing.plans as plans", "plans.id", "subscriptions.plan_id")
    .select([
      "plans.id",
      "plans.name",
      "plans.monthly_message_limit",
      "plans.deep_memory_enabled",
      "plans.adult_mode_enabled",
      "plans.creator_paid_characters_enabled",
      "subscriptions.status",
      "subscriptions.current_period_end",
    ])
    .where("subscriptions.user_id", "=", userId)
    .where("subscriptions.status", "in", ["active", "trialing"])
    .where("subscriptions.current_period_end", ">", new Date())
    .orderBy("subscriptions.current_period_end", "desc")
    .executeTakeFirst();

  if (subscription) {
    return {
      id: subscription.id,
      name: subscription.name,
      status: subscription.status,
      monthlyMessageLimit: subscription.monthly_message_limit,
      deepMemoryEnabled: subscription.deep_memory_enabled,
      adultModeEnabled: subscription.adult_mode_enabled,
      creatorPaidCharactersEnabled: subscription.creator_paid_characters_enabled,
      currentPeriodEnd: subscription.current_period_end.toISOString(),
    };
  }

  const freePlan = await db
    .selectFrom("billing.plans")
    .selectAll()
    .where("id", "=", "free")
    .executeTakeFirstOrThrow();

  return {
    id: freePlan.id,
    name: freePlan.name,
    status: "active",
    monthlyMessageLimit: freePlan.monthly_message_limit,
    deepMemoryEnabled: freePlan.deep_memory_enabled,
    adultModeEnabled: freePlan.adult_mode_enabled,
    creatorPaidCharactersEnabled: freePlan.creator_paid_characters_enabled,
    currentPeriodEnd: null,
  };
}

async function monthlyUserMessageCount(
  db: ReturnType<typeof createDatabase>,
  userId: string,
): Promise<number> {
  return completedUserTurnCount(db, {
    userId,
    since: monthlyBillingWindowStart(),
  });
}
