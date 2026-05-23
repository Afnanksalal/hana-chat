import type { AppConfig } from "@hana/config";
import type { HanaDatabase } from "@hana/database";
import type { Kysely } from "kysely";
import { enqueueOutboxEvent, eventKey, projectionIdempotencyKey } from "./outbox";
import { auditEvent } from "./session";
import { upsertCharacterVector, type CharacterVectorRecord } from "./vector-character";

export type CharacterProjectionRecord = CharacterVectorRecord;

export async function projectCharacterUpsert(input: {
  db: Kysely<HanaDatabase>;
  config: AppConfig;
  character: CharacterProjectionRecord;
  actorUserId: string;
  action: "create" | "publish";
}): Promise<void> {
  try {
    await upsertCharacterVector(input.config, input.character);
  } catch (error) {
    await safeAudit(input.db, {
      actorUserId: input.actorUserId,
      action: "creator.character.qdrant_projection_failed",
      resourceType: "creator.character",
      resourceId: input.character.id,
      metadata: { message: errorMessage(error) },
    });
  }

  await safeEnqueue(input.db, input.actorUserId, {
    topic: "creator.character.qdrant.upsert.requested",
    key: eventKey(input.character.id),
    idempotencyKey: projectionIdempotencyKey({
      topic: "creator.character.qdrant.upsert.requested",
      resourceId: input.character.id,
      action: input.action,
      revision: input.character.updatedAt.toISOString(),
    }),
    payload: characterPayload(input.character, input.action),
  });
  await safeEnqueue(input.db, input.actorUserId, {
    topic: "creator.character.neo4j.upsert.requested",
    key: eventKey(input.character.id),
    idempotencyKey: projectionIdempotencyKey({
      topic: "creator.character.neo4j.upsert.requested",
      resourceId: input.character.id,
      action: input.action,
      revision: input.character.updatedAt.toISOString(),
    }),
    payload: characterPayload(input.character, input.action),
  });
}

function characterPayload(
  character: CharacterProjectionRecord,
  action: "create" | "publish",
): Record<string, unknown> {
  return {
    action,
    characterId: character.id,
    creatorUserId: character.creatorUserId,
    visibility: character.visibility,
    moderationStatus: character.moderationStatus,
    rating: character.rating,
    tags: character.tags,
    priceCents: character.priceCents,
    monetizationEnabled: character.monetizationEnabled,
    updatedAt: character.updatedAt.toISOString(),
  };
}

async function safeEnqueue(
  db: Kysely<HanaDatabase>,
  actorUserId: string,
  input: {
    topic: string;
    key: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await enqueueOutboxEvent(db, input);
  } catch (error) {
    await safeAudit(db, {
      actorUserId,
      action: "platform.outbox.enqueue_failed",
      resourceType: "platform.outbox_event",
      resourceId: null,
      metadata: {
        topic: input.topic,
        idempotencyKey: input.idempotencyKey,
        message: errorMessage(error),
      },
    });
  }
}

async function safeAudit(
  db: Kysely<HanaDatabase>,
  input: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await auditEvent(db, {
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    });
  } catch {
    // Projection failures already have a durable Postgres source of truth.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown character projection error";
}
