import { loadConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import { Controller, Get, Headers, Post } from "@nestjs/common";
import { auditEvent, requireSession } from "./session";

@Controller("/v1")
export class SessionsController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/session")
  public async show(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);

    return {
      authenticated: true,
      user: {
        id: session.userId,
        displayName: session.displayName,
      },
      sessionId: session.sessionId,
    };
  }

  @Post("/auth/logout")
  public async logout(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);

    await this.db
      .updateTable("identity.sessions")
      .set({ revoked_at: new Date() })
      .where("id", "=", session.sessionId)
      .execute();

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "auth.logout",
      resourceType: "identity.session",
      resourceId: session.sessionId,
    });

    return { ok: true };
  }
}
