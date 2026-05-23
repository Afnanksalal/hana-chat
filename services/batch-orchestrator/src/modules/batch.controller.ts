import { loadConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { createIdempotencyKey } from "@hana/queue-core";
import { Body, Controller, Param, Post } from "@nestjs/common";
import { sql } from "kysely";

interface LeaseOutboxBody {
  maxItems?: number;
  workerId?: string;
  topics?: string[];
  lockSeconds?: number;
}

interface FailOutboxBody {
  error?: string;
  retryAfterSeconds?: number;
  workerId?: string;
}

interface AckOutboxBody {
  workerId?: string;
}

@Controller("/internal/batches")
export class BatchController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Post("/idempotency-key")
  public key(@Body() body: { parts: string[] }) {
    return {
      idempotencyKey: createIdempotencyKey(body.parts),
    };
  }

  @Post("/outbox/lease")
  public async leaseOutbox(@Body() body: LeaseOutboxBody) {
    const maxItems = clampInteger(body.maxItems ?? 50, 1, 250);
    const lockSeconds = clampInteger(body.lockSeconds ?? 30, 5, 300);
    const workerId = sanitizeWorkerId(body.workerId ?? `batch-${process.pid}`);
    const now = new Date();
    const expiredLockCutoff = new Date(now.getTime() - lockSeconds * 1000);
    const topics = Array.isArray(body.topics)
      ? body.topics
          .map((topic) => topic.trim())
          .filter(Boolean)
          .slice(0, 25)
      : [];

    const events = await this.db.transaction().execute(async (tx) => {
      let query = tx
        .selectFrom("platform.outbox_events")
        .select([
          "id",
          "topic",
          "event_key",
          "idempotency_key",
          "payload_json",
          "schema_version",
          "attempts",
          "occurred_at",
        ])
        .where((eb) =>
          eb.or([
            eb.and([
              eb("status", "in", ["pending", "failed"]),
              eb.or([eb("next_attempt_at", "is", null), eb("next_attempt_at", "<=", now)]),
            ]),
            eb.and([
              eb("status", "=", "processing"),
              eb("locked_at", "is not", null),
              eb("locked_at", "<=", expiredLockCutoff),
            ]),
          ]),
        )
        .orderBy("occurred_at", "asc")
        .limit(maxItems)
        .forUpdate()
        .skipLocked();

      if (topics.length > 0) {
        query = query.where("topic", "in", topics);
      }

      const leased = await query.execute();
      const ids = leased.map((event) => event.id);

      if (ids.length > 0) {
        await tx
          .updateTable("platform.outbox_events")
          .set({
            status: "processing",
            locked_at: new Date(),
            locked_by: workerId,
            attempts: sql<number>`attempts + 1`,
            next_attempt_at: sql<Date>`now() + (${lockSeconds}::text || ' seconds')::interval`,
          })
          .where("id", "in", ids)
          .execute();
      }

      return leased;
    });

    return {
      workerId,
      leasedCount: events.length,
      events,
    };
  }

  @Post("/outbox/:eventId/ack")
  public async ackOutbox(@Param("eventId") eventId: string, @Body() body: AckOutboxBody) {
    let query = this.db
      .updateTable("platform.outbox_events")
      .set({
        status: "published",
        locked_at: null,
        locked_by: null,
        last_error: null,
        next_attempt_at: null,
      })
      .where("id", "=", eventId)
      .where("status", "=", "processing");

    if (body.workerId) {
      query = query.where("locked_by", "=", sanitizeWorkerId(body.workerId));
    }

    const updated = await query.returning(["id"]).executeTakeFirst();

    if (!updated) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Outbox event lease was not found");
    }

    return {
      eventId,
      status: "published",
    };
  }

  @Post("/outbox/:eventId/fail")
  public async failOutbox(@Param("eventId") eventId: string, @Body() body: FailOutboxBody) {
    const retryAfterSeconds = clampInteger(body.retryAfterSeconds ?? 60, 5, 3600);
    const workerId = body.workerId ? sanitizeWorkerId(body.workerId) : null;
    const event = await this.db
      .selectFrom("platform.outbox_events")
      .select(["id", "attempts", "locked_by", "status"])
      .where("id", "=", eventId)
      .executeTakeFirst();

    if (!event || event.status !== "processing" || (workerId && event.locked_by !== workerId)) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Outbox event lease was not found");
    }

    const status = event.attempts >= 10 ? "dead_letter" : "failed";

    await this.db
      .updateTable("platform.outbox_events")
      .set({
        status,
        locked_at: null,
        locked_by: null,
        last_error: (body.error ?? "worker_failed").slice(0, 500),
        next_attempt_at:
          status === "dead_letter" ? null : new Date(Date.now() + retryAfterSeconds * 1000),
      })
      .where("id", "=", eventId)
      .where("status", "=", "processing")
      .execute();

    return {
      eventId,
      status,
      retryAfterSeconds: status === "dead_letter" ? null : retryAfterSeconds,
    };
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function sanitizeWorkerId(workerId: string): string {
  return workerId.replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 80) || `batch-${process.pid}`;
}
