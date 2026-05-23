import type { AppConfig } from "@hana/config";
import type { HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import type { Kysely } from "kysely";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  displayName: string | null;
}

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken(sessionId: string, expiresAt: Date, secret: string): string {
  const expiresMs = String(expiresAt.getTime());
  const payload = `${sessionId}.${expiresMs}`;
  const signature = base64Url(createHmac("sha256", secret).update(payload).digest());

  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
): { sessionId: string; expiresAt: Date } | undefined {
  if (!token) {
    return undefined;
  }

  const [sessionId, expiresMs, signature] = token.split(".");

  if (!sessionId || !expiresMs || !signature) {
    return undefined;
  }

  const expiresAtMs = Number(expiresMs);

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return undefined;
  }

  const payload = `${sessionId}.${expiresMs}`;
  const expected = base64Url(createHmac("sha256", secret).update(payload).digest());
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return undefined;
  }

  return {
    sessionId,
    expiresAt: new Date(expiresAtMs),
  };
}

export function bearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

export async function requireSession(
  db: Kysely<HanaDatabase>,
  config: AppConfig,
  authorizationHeader: string | undefined,
): Promise<AuthenticatedSession> {
  const token = bearerToken(authorizationHeader);
  const parsed = verifySessionToken(token, config.SESSION_SECRET);

  if (!parsed || !token) {
    throw new DomainError("AUTH_REQUIRED", "Valid session required");
  }

  const tokenHash = sha256Hex(token);
  const session = await db
    .selectFrom("identity.sessions as sessions")
    .innerJoin("identity.users as users", "users.id", "sessions.user_id")
    .select(["sessions.id", "sessions.user_id", "users.display_name"])
    .where("sessions.id", "=", parsed.sessionId)
    .where("sessions.token_hash", "=", tokenHash)
    .where("sessions.revoked_at", "is", null)
    .where("sessions.expires_at", ">", new Date())
    .where("users.status", "in", ["active", "limited"])
    .executeTakeFirst();

  if (!session) {
    throw new DomainError("AUTH_REQUIRED", "Session expired or revoked");
  }

  await db
    .updateTable("identity.sessions")
    .set({ last_seen_at: new Date() })
    .where("id", "=", session.id)
    .execute();

  return {
    sessionId: session.id,
    userId: session.user_id,
    displayName: session.display_name,
  };
}

export async function requireAdmin(
  db: Kysely<HanaDatabase>,
  config: AppConfig,
  authorizationHeader: string | undefined,
): Promise<AuthenticatedSession> {
  const session = await requireSession(db, config, authorizationHeader);
  const role = await db
    .selectFrom("identity.user_roles")
    .select(["role"])
    .where("user_id", "=", session.userId)
    .where("role", "=", "admin")
    .executeTakeFirst();

  if (!role) {
    throw new DomainError("AUTH_FORBIDDEN", "Admin access required");
  }

  return session;
}

export async function auditEvent(
  db: Kysely<HanaDatabase>,
  input: {
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto("platform.audit_events")
    .values({
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      metadata_json: input.metadata ?? {},
    })
    .execute();
}
