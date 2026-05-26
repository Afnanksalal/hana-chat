import { loadConfig } from "@hana/config";
import { UpdateSettingsRequestSchema } from "@hana/contracts";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Patch } from "@nestjs/common";
import { auditEvent, requireSession } from "./session";

@Controller("/v1/settings")
export class SettingsController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get()
  public async show(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    await this.ensureSettings(session.userId);
    const [settings, user] = await Promise.all([
      this.db
        .selectFrom("identity.user_settings")
        .selectAll()
        .where("user_id", "=", session.userId)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom("identity.users")
        .select(["avatar_url"])
        .where("id", "=", session.userId)
        .executeTakeFirstOrThrow(),
    ]);

    return toSettingsResponse(settings, user.avatar_url);
  }

  @Patch()
  public async update(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = UpdateSettingsRequestSchema.parse(body);

    if (input.adultModeEnabled) {
      const ultra = await this.db
        .selectFrom("billing.subscriptions")
        .select(["id"])
        .where("user_id", "=", session.userId)
        .where("plan_id", "=", "ultra")
        .where("status", "in", ["active", "trialing"])
        .where("current_period_end", ">", new Date())
        .executeTakeFirst();

      if (!ultra) {
        throw new DomainError("ENTITLEMENT_REQUIRED", "Hana Ultra is required for 18+ spaces");
      }
    }

    await this.ensureSettings(session.userId);
    const updated = await this.db
      .updateTable("identity.user_settings")
      .set({
        ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
        ...(input.adultModeEnabled !== undefined
          ? {
              adult_mode_enabled: input.adultModeEnabled,
              adult_verified_at: input.adultModeEnabled ? new Date() : null,
            }
          : {}),
        ...(input.memoryEnabled !== undefined ? { memory_enabled: input.memoryEnabled } : {}),
        ...(input.marketingOptIn !== undefined ? { marketing_opt_in: input.marketingOptIn } : {}),
        updated_at: new Date(),
      })
      .where("user_id", "=", session.userId)
      .returningAll()
      .executeTakeFirstOrThrow();

    if (input.displayName !== undefined || input.avatarUrl !== undefined) {
      await this.db
        .updateTable("identity.users")
        .set({
          ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
          ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
          updated_at: new Date(),
        })
        .where("id", "=", session.userId)
        .execute();
    }

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "settings.update",
      resourceType: "identity.user_settings",
      resourceId: session.userId,
      metadata: input,
    });

    const user = await this.db
      .selectFrom("identity.users")
      .select(["avatar_url"])
      .where("id", "=", session.userId)
      .executeTakeFirstOrThrow();

    return toSettingsResponse(updated, user.avatar_url);
  }

  private async ensureSettings(userId: string): Promise<void> {
    await this.db
      .insertInto("identity.user_settings")
      .values({
        user_id: userId,
        display_name: "Hana User",
      })
      .onConflict((oc) => oc.column("user_id").doNothing())
      .execute();
  }
}

function toSettingsResponse(
  settings: {
    display_name: string | null;
    adult_mode_enabled: boolean;
    adult_verified_at: Date | null;
    memory_enabled: boolean;
    marketing_opt_in: boolean;
  },
  avatarUrl: string | null | undefined,
) {
  return {
    displayName: settings.display_name,
    avatarUrl: avatarUrl ?? null,
    adultModeEnabled: settings.adult_mode_enabled,
    adultVerifiedAt: settings.adult_verified_at?.toISOString() ?? null,
    memoryEnabled: settings.memory_enabled,
    marketingOptIn: settings.marketing_opt_in,
  };
}
