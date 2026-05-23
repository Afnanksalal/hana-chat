import type { AppConfig } from "@hana/config";
import type { HanaDatabase } from "@hana/database";
import type { Kysely } from "kysely";
import { auditEvent } from "./session";
import { deleteMemoryVector, upsertMemoryVector, type MemoryVectorRecord } from "./vector-memory";
import { enqueueOutboxEvent, eventKey, projectionIdempotencyKey } from "./outbox";

export interface MemoryProjectionRow {
  id: string;
  user_id: string;
  character_id: string | null;
  conversation_id: string | null;
  scope: string;
  kind: string;
  text: string;
  confidence: number;
  importance: number;
  emotional_weight: number;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
}

export const memoryProjectionColumns = [
  "id",
  "user_id",
  "character_id",
  "conversation_id",
  "scope",
  "kind",
  "text",
  "confidence",
  "importance",
  "emotional_weight",
  "created_at",
  "updated_at",
  "is_active",
] as const;

export async function projectMemoryUpsert(input: {
  db: Kysely<HanaDatabase>;
  config: AppConfig;
  memory: MemoryProjectionRow;
  actorUserId: string;
  action: "create" | "update" | "extract";
}): Promise<void> {
  await runVectorProjection(input, async () => {
    await upsertMemoryVector(input.config, toVectorRecord(input.memory));
  });
  await enqueueMemoryProjectionEvents(input);
}

export async function projectMemoryDelete(input: {
  db: Kysely<HanaDatabase>;
  config: AppConfig;
  memory: MemoryProjectionRow;
  actorUserId: string;
}): Promise<void> {
  await runVectorProjection(input, async () => {
    await deleteMemoryVector(input.config, input.memory.id);
  });
  await enqueueMemoryProjectionEvents({
    ...input,
    action: "delete",
  });
}

function toVectorRecord(memory: MemoryProjectionRow): MemoryVectorRecord {
  return {
    id: memory.id,
    userId: memory.user_id,
    characterId: memory.character_id,
    conversationId: memory.conversation_id,
    scope: memory.scope,
    kind: memory.kind,
    text: memory.text,
    confidence: memory.confidence,
    importance: memory.importance,
    emotionalWeight: memory.emotional_weight,
    createdAt: memory.created_at,
    updatedAt: memory.updated_at,
    isActive: memory.is_active,
  };
}

async function enqueueMemoryProjectionEvents(input: {
  db: Kysely<HanaDatabase>;
  memory: MemoryProjectionRow;
  actorUserId: string;
  action: "create" | "update" | "extract" | "delete";
}): Promise<void> {
  const revision = input.memory.updated_at.toISOString();
  const payload = {
    action: input.action,
    memoryId: input.memory.id,
    userId: input.memory.user_id,
    characterId: input.memory.character_id,
    conversationId: input.memory.conversation_id,
    scope: input.memory.scope,
    kind: input.memory.kind,
    isActive: input.memory.is_active,
    updatedAt: revision,
  };

  await safeEnqueue(input.db, input.actorUserId, {
    topic: "memory.qdrant.upsert.requested",
    key: eventKey(input.memory.id),
    idempotencyKey: projectionIdempotencyKey({
      topic: "memory.qdrant.upsert.requested",
      resourceId: input.memory.id,
      action: input.action,
      revision,
    }),
    payload,
  });
  await safeEnqueue(input.db, input.actorUserId, {
    topic: "memory.neo4j.upsert.requested",
    key: eventKey(input.memory.id),
    idempotencyKey: projectionIdempotencyKey({
      topic: "memory.neo4j.upsert.requested",
      resourceId: input.memory.id,
      action: input.action,
      revision,
    }),
    payload,
  });
}

async function runVectorProjection(
  input: {
    db: Kysely<HanaDatabase>;
    memory: MemoryProjectionRow;
    actorUserId: string;
  },
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    await safeAudit(input.db, {
      actorUserId: input.actorUserId,
      action: "memory.qdrant.projection_failed",
      resourceType: "memory.fact",
      resourceId: input.memory.id,
      metadata: { message: errorMessage(error) },
    });
  }
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
    // Audit failures should not block the user's chat or memory write path.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown projection error";
}
