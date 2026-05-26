import { z } from "zod";

export const EventTopicSchema = z.enum([
  "chat.turn.created",
  "chat.turn.completed",
  "chat.message.persisted",
  "identity.email.verified",
  "risk.session.scored",
  "risk.account.cluster.detected",
  "memory.extraction.requested",
  "memory.embedding.requested",
  "memory.qdrant.upsert.requested",
  "memory.neo4j.upsert.requested",
  "memory.consolidation.requested",
  "moderation.review.requested",
  "billing.usage.metered",
  "notification.delivery.requested",
  "analytics.event.created",
  "user.data.delete.requested",
]);

export type EventTopic = z.infer<typeof EventTopicSchema>;

export interface EventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  topic: EventTopic;
  key: string;
  idempotencyKey: string;
  payload: TPayload;
  occurredAt: string;
  schemaVersion: number;
  correlationId?: string;
  causationId?: string;
}

export interface OutboxRecord<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> extends EventEnvelope<TPayload> {
  status: "pending" | "publishing" | "published" | "failed";
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface EventPublisher {
  publish<TPayload extends Record<string, unknown>>(event: EventEnvelope<TPayload>): Promise<void>;
}

export function createEventEnvelope<TPayload extends Record<string, unknown>>(input: {
  id: string;
  topic: EventTopic;
  key: string;
  idempotencyKey: string;
  payload: TPayload;
  occurredAt?: string;
  schemaVersion?: number;
  correlationId?: string;
  causationId?: string;
}): EventEnvelope<TPayload> {
  return {
    id: input.id,
    topic: input.topic,
    key: input.key,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    schemaVersion: input.schemaVersion ?? 1,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
  };
}
