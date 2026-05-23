import type { HanaDatabase } from "@hana/database";
import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";

export async function enqueueOutboxEvent(
  db: Kysely<HanaDatabase>,
  input: {
    topic: string;
    key: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto("platform.outbox_events")
    .values({
      topic: input.topic,
      event_key: input.key,
      idempotency_key: input.idempotencyKey,
      payload_json: input.payload,
      schema_version: 1,
      occurred_at: new Date(),
      next_attempt_at: null,
      last_error: null,
    })
    .execute();
}

export function projectionIdempotencyKey(input: {
  topic: string;
  resourceId: string;
  action: string;
  revision: string;
}): string {
  return `${input.topic}:${input.resourceId}:${input.action}:${input.revision}`;
}

export function eventKey(resourceId: string): string {
  return resourceId || randomUUID();
}
