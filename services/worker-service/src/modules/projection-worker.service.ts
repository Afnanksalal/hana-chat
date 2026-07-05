import { loadConfig, type AppConfig } from "@hana/config";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import {
  buildMemorySnapshotCommitment,
  type StellarMemorySnapshotFact,
  type StellarMemorySnapshotManifestInput,
  type StellarSnapshotKind,
} from "@hana/stellar-bridge";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { sql, type Kysely } from "kysely";
import neo4j, { type Driver } from "neo4j-driver";
import { createHash } from "node:crypto";

const VECTOR_SIZE = 1536;
const WORKER_TOPICS = [
  "memory.qdrant.upsert.requested",
  "memory.neo4j.upsert.requested",
  "memory.snapshot.requested",
  "creator.character.qdrant.upsert.requested",
  "creator.character.neo4j.upsert.requested",
  "analytics.event.created",
  "chat.turn.completed",
] as const;

type WorkerTopic = (typeof WORKER_TOPICS)[number];

interface LeasedEvent {
  id: string;
  topic: WorkerTopic;
  payload_json: unknown;
  attempts: number;
}

@Injectable()
export class ProjectionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);
  private readonly driver: Driver = neo4j.driver(
    this.config.NEO4J_URI,
    neo4j.auth.basic(this.config.NEO4J_USER, this.config.NEO4J_PASSWORD),
  );
  private readonly workerId = `worker-service-${process.pid}`;
  private interval: NodeJS.Timeout | undefined;

  public onModuleInit(): void {
    void this.ensureNeo4jConstraints();

    if (process.env["HANA_WORKER_AUTOSTART"] === "false") {
      return;
    }

    this.interval = setInterval(() => {
      void this.drainOnce(25).catch((error) => {
        console.error("projection worker drain failed", error);
      });
    }, 5_000);
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }

    await Promise.allSettled([this.driver.close(), this.db.destroy()]);
  }

  public async drainOnce(maxItems = 25): Promise<{ workerId: string; processed: number }> {
    const lease = await leaseOutboxEventsWithBoundary(this.config, this.db, {
      workerId: this.workerId,
      maxItems: clampInteger(maxItems, 1, 100),
      lockSeconds: 60,
      topics: [...WORKER_TOPICS],
    });
    const events = lease.events;
    let processed = 0;

    for (const event of events) {
      try {
        await this.processEvent(event);
        await ackOutboxEventWithBoundary(this.config, this.db, event.id, this.workerId);
        processed += 1;
      } catch (error) {
        await failOutboxEventWithBoundary(this.config, this.db, event, this.workerId, error);
      }
    }

    return { workerId: this.workerId, processed };
  }

  private async ensureNeo4jConstraints(): Promise<void> {
    const session = this.driver.session();

    try {
      await session.executeWrite(async (tx) => {
        await tx.run("CREATE CONSTRAINT user_id IF NOT EXISTS FOR (n:User) REQUIRE n.id IS UNIQUE");
        await tx.run(
          "CREATE CONSTRAINT character_id IF NOT EXISTS FOR (n:Character) REQUIRE n.id IS UNIQUE",
        );
        await tx.run(
          "CREATE CONSTRAINT conversation_id IF NOT EXISTS FOR (n:Conversation) REQUIRE n.id IS UNIQUE",
        );
        await tx.run(
          "CREATE CONSTRAINT memory_fact_id IF NOT EXISTS FOR (n:MemoryFact) REQUIRE n.id IS UNIQUE",
        );
      });
    } catch (error) {
      console.error("neo4j constraint setup failed", error);
    } finally {
      await session.close();
    }
  }

  private async processEvent(event: LeasedEvent): Promise<void> {
    if (event.topic === "memory.qdrant.upsert.requested") {
      await this.projectMemoryToQdrant(event.payload_json);
      return;
    }

    if (event.topic === "memory.neo4j.upsert.requested") {
      await this.projectMemoryToNeo4j(event.payload_json);
      return;
    }

    if (event.topic === "memory.snapshot.requested") {
      await this.recordMemorySnapshotCommitment(event.payload_json);
      return;
    }

    if (event.topic === "creator.character.qdrant.upsert.requested") {
      await this.projectCharacterToQdrant(event.payload_json);
      return;
    }

    if (event.topic === "creator.character.neo4j.upsert.requested") {
      await this.projectCharacterToNeo4j(event.payload_json);
      return;
    }

    if (event.topic === "analytics.event.created") {
      await this.projectAnalyticsEvent(event.payload_json);
      return;
    }

    if (event.topic === "chat.turn.completed") {
      await this.projectConversationTurnToNeo4j(event.payload_json);
      return;
    }

    throw new DomainError("VALIDATION_FAILED", "Unsupported worker topic", {
      topic: event.topic,
    });
  }

  private async projectAnalyticsEvent(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== "object") {
      throw new DomainError("VALIDATION_FAILED", "Analytics payload must be an object");
    }

    const kind = (payload as Record<string, unknown>)["kind"];

    if (kind !== "model_call") {
      return;
    }

    await this.projectModelCallToClickHouse(payloadString(payload, "modelCallId"));
  }

  private async projectModelCallToClickHouse(modelCallId: string): Promise<void> {
    const modelCall = await this.db
      .selectFrom("analytics.model_calls")
      .selectAll()
      .where("id", "=", modelCallId)
      .executeTakeFirst();

    if (!modelCall) {
      return;
    }

    await clickHouseInsert(this.config, "hana.model_calls", {
      model_call_id: modelCall.id,
      created_at: toClickHouseDateTime64(modelCall.created_at),
      user_id: modelCall.user_id ?? "",
      provider: modelCall.provider,
      model: modelCall.model,
      input_tokens: modelCall.input_tokens,
      cached_input_tokens: modelCall.cached_input_tokens,
      output_tokens: modelCall.output_tokens,
      estimated_cost_usd: Number(modelCall.estimated_cost_usd),
      latency_ms: modelCall.latency_ms,
    });
  }

  private async projectMemoryToQdrant(payload: unknown): Promise<void> {
    const memoryId = payloadString(payload, "memoryId");
    const memory = await this.db
      .selectFrom("memory.facts")
      .selectAll()
      .where("id", "=", memoryId)
      .executeTakeFirst();

    if (!memory || !memory.is_active) {
      await qdrantDelete(this.config, this.config.QDRANT_MEMORY_COLLECTION, memoryId);
      return;
    }

    await qdrantUpsert(this.config, this.config.QDRANT_MEMORY_COLLECTION, {
      id: memory.id,
      vector: embedTextForRetrieval(memory.text),
      payload: {
        memoryId: memory.id,
        userId: memory.user_id,
        characterId: memory.character_id ?? "__global__",
        conversationId: memory.conversation_id ?? "__none__",
        scope: memory.scope,
        kind: memory.kind,
        importance: memory.importance,
        confidence: memory.confidence,
        emotionalWeight: memory.emotional_weight,
        createdAt: memory.created_at.toISOString(),
        updatedAt: memory.updated_at.toISOString(),
        isActive: memory.is_active,
        source: "fact",
      },
    });
  }

  private async projectMemoryToNeo4j(payload: unknown): Promise<void> {
    const memoryId = payloadString(payload, "memoryId");
    const memory = await this.db
      .selectFrom("memory.facts")
      .selectAll()
      .where("id", "=", memoryId)
      .executeTakeFirst();

    if (!memory) {
      return;
    }

    const session = this.driver.session();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
MERGE (u:User {id: $userId})
MERGE (m:MemoryFact {id: $memoryId})
SET m.kind = $kind,
    m.scope = $scope,
    m.importance = $importance,
    m.confidence = $confidence,
    m.isActive = $isActive,
    m.updatedAt = $updatedAt
MERGE (u)-[um:OWNS_MEMORY]->(m)
SET um.updatedAt = $updatedAt
WITH m
FOREACH (_ IN CASE WHEN $characterId IS NULL THEN [] ELSE [1] END |
  MERGE (c:Character {id: $characterId})
  MERGE (c)-[:HAS_MEMORY]->(m)
)
WITH m
FOREACH (_ IN CASE WHEN $conversationId IS NULL THEN [] ELSE [1] END |
  MERGE (conv:Conversation {id: $conversationId})
  MERGE (conv)-[:CONTAINS_MEMORY]->(m)
)
`,
          {
            userId: memory.user_id,
            memoryId: memory.id,
            characterId: memory.character_id,
            conversationId: memory.conversation_id,
            kind: memory.kind,
            scope: memory.scope,
            importance: memory.importance,
            confidence: memory.confidence,
            isActive: memory.is_active,
            updatedAt: memory.updated_at.toISOString(),
          },
        ),
      );
    } finally {
      await session.close();
    }
  }

  private async recordMemorySnapshotCommitment(payload: unknown): Promise<void> {
    if (!this.config.STELLAR_ENABLED || !this.config.STELLAR_STORAGE_ENABLED) {
      return;
    }

    const snapshotKind = parseSnapshotKind(payloadOptionalString(payload, "snapshotKind"));

    if (snapshotKind === "user_export") {
      await this.recordUserExportSnapshot(payloadString(payload, "userId"));
      return;
    }

    if (snapshotKind === "creator_soul_pack") {
      await this.recordCreatorSoulPackSnapshot(payloadString(payload, "characterId"));
      return;
    }

    const userId = payloadString(payload, "userId");
    const characterId = payloadString(payload, "characterId");
    const conversationId = payloadString(payload, "conversationId");
    const minImportance = this.config.STELLAR_STORAGE_SNAPSHOT_MIN_IMPORTANCE;
    const facts = await this.db
      .selectFrom("memory.facts")
      .select([
        "id",
        "kind",
        "text",
        "importance",
        "emotional_weight",
        "source_message_ids",
        "updated_at",
      ])
      .where("user_id", "=", userId)
      .where("character_id", "=", characterId)
      .where("conversation_id", "=", conversationId)
      .where("scope", "=", "conversation")
      .where("is_active", "=", true)
      .where("importance", ">=", minImportance)
      .orderBy("importance", "desc")
      .orderBy("updated_at", "desc")
      .limit(100)
      .execute();

    if (facts.length === 0) {
      return;
    }

    const snapshotFacts: StellarMemorySnapshotFact[] = facts.map((fact) => ({
      id: fact.id,
      kind: fact.kind,
      importance: fact.importance,
      emotionalWeight: fact.emotional_weight,
      updatedAt: fact.updated_at.toISOString(),
      text: fact.text,
      sourceMessageIds: fact.source_message_ids,
    }));
    const snapshotInput = {
      snapshotKind: "conversation_memory",
      network: this.config.STELLAR_NETWORK,
      userId,
      characterId,
      conversationId,
      facts: snapshotFacts,
    } as const;

    await this.persistDecentralizedSnapshot(snapshotInput, `memory.snapshot:${conversationId}`);
  }

  private async recordUserExportSnapshot(userId: string): Promise<void> {
    const facts = await this.db
      .selectFrom("memory.facts")
      .select([
        "id",
        "kind",
        "text",
        "importance",
        "emotional_weight",
        "source_message_ids",
        "updated_at",
      ])
      .where("user_id", "=", userId)
      .where("is_active", "=", true)
      .orderBy("updated_at", "desc")
      .limit(500)
      .execute();

    if (facts.length === 0) {
      return;
    }

    await this.persistDecentralizedSnapshot(
      {
        snapshotKind: "user_export",
        network: this.config.STELLAR_NETWORK,
        userId,
        characterId: null,
        conversationId: null,
        facts: facts.map((fact) => ({
          id: fact.id,
          kind: fact.kind,
          importance: fact.importance,
          emotionalWeight: fact.emotional_weight,
          updatedAt: fact.updated_at.toISOString(),
          text: fact.text,
          sourceMessageIds: fact.source_message_ids,
        })),
      },
      `memory.export:${userId}`,
    );
  }

  private async recordCreatorSoulPackSnapshot(characterId: string): Promise<void> {
    const character = await this.db
      .selectFrom("creator.characters as characters")
      .innerJoin(
        "creator.character_versions as versions",
        "versions.id",
        "characters.current_version_id",
      )
      .select([
        "characters.id",
        "characters.creator_user_id",
        "characters.name",
        "characters.description",
        "characters.slug",
        "characters.avatar_url",
        "characters.cover_image_url",
        "characters.marketplace_category",
        "characters.marketplace_preview",
        "characters.model_profile",
        "characters.visibility",
        "characters.moderation_status",
        "versions.id as version_id",
        "versions.persona_prompt",
        "versions.greeting",
        "versions.scenario_prompt",
        "versions.first_message_style",
        "versions.speaking_style",
        "versions.personality_traits",
        "versions.example_dialogues_json",
        "versions.rating",
        "versions.tags",
        "versions.created_at",
      ])
      .where("characters.id", "=", characterId)
      .executeTakeFirst();

    if (!character) {
      return;
    }

    const soulPack = {
      characterId: character.id,
      name: character.name,
      description: character.description,
      slug: character.slug,
      avatarUrl: character.avatar_url,
      coverImageUrl: character.cover_image_url,
      marketplaceCategory: character.marketplace_category,
      marketplacePreview: character.marketplace_preview,
      modelProfile: character.model_profile,
      visibility: character.visibility,
      moderationStatus: character.moderation_status,
      personaPrompt: character.persona_prompt,
      greeting: character.greeting,
      scenarioPrompt: character.scenario_prompt,
      firstMessageStyle: character.first_message_style,
      speakingStyle: character.speaking_style,
      personalityTraits: character.personality_traits,
      exampleDialogues: character.example_dialogues_json,
      rating: character.rating,
      tags: character.tags,
    };

    await this.persistDecentralizedSnapshot(
      {
        snapshotKind: "creator_soul_pack",
        network: this.config.STELLAR_NETWORK,
        userId: character.creator_user_id,
        characterId: character.id,
        conversationId: null,
        facts: [
          {
            id: character.version_id,
            kind: "creator_soul_pack",
            importance: 1,
            emotionalWeight: 0,
            updatedAt: character.created_at.toISOString(),
            text: JSON.stringify(soulPack),
            sourceMessageIds: [],
          },
        ],
      },
      `creator.soul_pack:${character.id}`,
    );
  }

  private async persistDecentralizedSnapshot(
    snapshotInput: StellarMemorySnapshotManifestInput,
    idempotencyPrefix: string,
  ): Promise<void> {
    const commitment = buildMemorySnapshotCommitment(snapshotInput);
    const failureReason: string | null = null;

    const now = new Date();

    await this.db
      .insertInto("memory.decentralized_snapshots")
      .values({
        user_id: snapshotInput.userId,
        character_id: snapshotInput.characterId,
        conversation_id: snapshotInput.conversationId,
        snapshot_kind: snapshotInput.snapshotKind,
        storage_network: `stellar-${this.config.STELLAR_NETWORK}`,
        root_hash: commitment.rootHash,
        tx_hash: null,
        manifest_hash: commitment.manifestHash,
        encryption_mode: "manifest_hash_only",
        encryption_key_ref: "stellar-manifest-only",
        status: "pending_upload",
        source_memory_ids: commitment.sourceMemoryIds,
        manifest_json: commitment.manifest,
        idempotency_key: `${idempotencyPrefix}:${commitment.manifestHash}`,
        failure_reason: failureReason,
        updated_at: now,
        confirmed_at: null,
      })
      .onConflict((oc) =>
        oc.column("idempotency_key").doUpdateSet({
          status: "pending_upload",
          root_hash: commitment.rootHash,
          tx_hash: null,
          encryption_mode: "manifest_hash_only",
          encryption_key_ref: "stellar-manifest-only",
          manifest_json: commitment.manifest,
          failure_reason: failureReason,
          updated_at: now,
        }),
      )
      .execute();
  }

  private async projectCharacterToQdrant(payload: unknown): Promise<void> {
    const characterId = payloadString(payload, "characterId");
    const character = await selectCharacterForProjection(this.db, characterId);

    if (
      !character ||
      character.visibility !== "public" ||
      character.moderation_status !== "approved"
    ) {
      await qdrantDelete(this.config, this.config.QDRANT_CHARACTER_COLLECTION, characterId);
      return;
    }

    await qdrantUpsert(this.config, this.config.QDRANT_CHARACTER_COLLECTION, {
      id: character.id,
      vector: embedTextForRetrieval(
        [
          character.name,
          character.description,
          character.persona_prompt,
          character.greeting,
          character.scenario_prompt ?? "",
          character.speaking_style ?? "",
          character.personality_traits.join(" "),
          character.marketplace_category,
          character.model_profile,
          character.rating,
          character.tags.join(" "),
        ].join("\n"),
      ),
      payload: {
        characterId: character.id,
        creatorUserId: character.creator_user_id,
        name: character.name,
        visibility: character.visibility,
        moderationStatus: character.moderation_status,
        rating: character.rating,
        tags: character.tags,
        marketplaceCategory: character.marketplace_category,
        modelProfile: character.model_profile,
        priceCents: character.price_cents,
        monetizationEnabled: character.monetization_enabled,
        updatedAt: character.updated_at.toISOString(),
        source: "character",
      },
    });
  }

  private async projectCharacterToNeo4j(payload: unknown): Promise<void> {
    const characterId = payloadString(payload, "characterId");
    const character = await selectCharacterForProjection(this.db, characterId);

    if (!character) {
      return;
    }

    const session = this.driver.session();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
MERGE (creator:User {id: $creatorUserId})
MERGE (ch:Character {id: $characterId})
SET ch.name = $name,
    ch.visibility = $visibility,
    ch.moderationStatus = $moderationStatus,
    ch.rating = $rating,
    ch.marketplaceCategory = $marketplaceCategory,
    ch.modelProfile = $modelProfile,
    ch.priceCents = $priceCents,
    ch.monetizationEnabled = $monetizationEnabled,
    ch.updatedAt = $updatedAt
MERGE (creator)-[r:CREATED_CHARACTER]->(ch)
SET r.updatedAt = $updatedAt
`,
          {
            creatorUserId: character.creator_user_id,
            characterId: character.id,
            name: character.name,
            visibility: character.visibility,
            moderationStatus: character.moderation_status,
            rating: character.rating,
            marketplaceCategory: character.marketplace_category,
            modelProfile: character.model_profile,
            priceCents: character.price_cents,
            monetizationEnabled: character.monetization_enabled,
            updatedAt: character.updated_at.toISOString(),
          },
        ),
      );
    } finally {
      await session.close();
    }
  }

  private async projectConversationTurnToNeo4j(payload: unknown): Promise<void> {
    const userId = payloadString(payload, "userId");
    const characterId = payloadString(payload, "characterId");
    const conversationId = payloadString(payload, "conversationId");
    const userMessageId = payloadString(payload, "userMessageId");
    const assistantMessageId = payloadString(payload, "assistantMessageId");
    const occurredAt = payloadOptionalString(payload, "occurredAt") ?? new Date().toISOString();
    const [messageCount, memoryCount] = await Promise.all([
      this.db
        .selectFrom("chat.messages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("user_id", "=", userId)
        .where("character_id", "=", characterId)
        .where("conversation_id", "=", conversationId)
        .where("role", "=", "user")
        .executeTakeFirst(),
      this.db
        .selectFrom("memory.facts")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("user_id", "=", userId)
        .where("character_id", "=", characterId)
        .where("conversation_id", "=", conversationId)
        .where("scope", "=", "conversation")
        .where("kind", "not in", ["safety", "system"])
        .where("is_active", "=", true)
        .executeTakeFirst(),
    ]);
    const userMessageCount = Number(messageCount?.count ?? 0);
    const activeMemoryCount = Number(memoryCount?.count ?? 0);
    const session = this.driver.session();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
MERGE (u:User {id: $userId})
MERGE (ch:Character {id: $characterId})
MERGE (conv:Conversation {id: $conversationId})
SET conv.userMessageCount = $userMessageCount,
    conv.activeMemoryCount = $activeMemoryCount,
    conv.lastUserMessageId = $userMessageId,
    conv.lastAssistantMessageId = $assistantMessageId,
    conv.updatedAt = $occurredAt
MERGE (u)-[uc:HAS_CONVERSATION]->(conv)
SET uc.updatedAt = $occurredAt
MERGE (conv)-[cw:WITH_CHARACTER]->(ch)
SET cw.updatedAt = $occurredAt
MERGE (u)-[rel:RELATES_TO]->(ch)
SET rel.turns = $userMessageCount,
    rel.activeMemoryCount = $activeMemoryCount,
    rel.lastConversationId = $conversationId,
    rel.updatedAt = $occurredAt
`,
          {
            userId,
            characterId,
            conversationId,
            userMessageId,
            assistantMessageId,
            userMessageCount,
            activeMemoryCount,
            occurredAt,
          },
        ),
      );
    } finally {
      await session.close();
    }
  }
}

async function leaseOutboxEvents(
  db: Kysely<HanaDatabase>,
  input: { workerId: string; maxItems: number; lockSeconds: number },
): Promise<LeasedEvent[]> {
  const now = new Date();
  const expiredLockCutoff = new Date(now.getTime() - input.lockSeconds * 1000);

  return db.transaction().execute(async (tx) => {
    const leased = await tx
      .selectFrom("platform.outbox_events")
      .select(["id", "topic", "payload_json", "attempts"])
      .where("topic", "in", [...WORKER_TOPICS])
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
      .limit(input.maxItems)
      .forUpdate()
      .skipLocked()
      .execute();
    const ids = leased.map((event) => event.id);

    if (ids.length > 0) {
      await tx
        .updateTable("platform.outbox_events")
        .set({
          status: "processing",
          locked_at: now,
          locked_by: input.workerId,
          attempts: sql<number>`attempts + 1`,
          next_attempt_at: sql<Date>`now() + (${input.lockSeconds}::text || ' seconds')::interval`,
        })
        .where("id", "in", ids)
        .execute();
    }

    return leased.map((event) => ({
      ...event,
      topic: event.topic as WorkerTopic,
    }));
  });
}

async function leaseOutboxEventsWithBoundary(
  config: AppConfig,
  db: Kysely<HanaDatabase>,
  input: { workerId: string; maxItems: number; lockSeconds: number; topics: WorkerTopic[] },
): Promise<{ workerId: string; events: LeasedEvent[]; source: "batch-orchestrator" | "database" }> {
  try {
    const response = await fetchWithTimeout(
      `${config.BATCH_ORCHESTRATOR_URL.replace(/\/+$/, "")}/internal/batches/outbox/lease`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      2_000,
    );

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      const events = Array.isArray(payload["events"])
        ? payload["events"]
            .map(parseLeasedEvent)
            .filter((event): event is LeasedEvent => Boolean(event))
        : [];

      return {
        workerId: typeof payload["workerId"] === "string" ? payload["workerId"] : input.workerId,
        events,
        source: "batch-orchestrator",
      };
    }
  } catch {
    // The worker can lease directly from Postgres if the batch boundary restarts.
  }

  return {
    workerId: input.workerId,
    events: await leaseOutboxEvents(db, input),
    source: "database",
  };
}

async function ackOutboxEvent(
  db: Kysely<HanaDatabase>,
  eventId: string,
  workerId: string,
): Promise<void> {
  await db
    .updateTable("platform.outbox_events")
    .set({
      status: "published",
      locked_at: null,
      locked_by: null,
      last_error: null,
      next_attempt_at: null,
    })
    .where("id", "=", eventId)
    .where("status", "=", "processing")
    .where("locked_by", "=", workerId)
    .execute();
}

async function ackOutboxEventWithBoundary(
  config: AppConfig,
  db: Kysely<HanaDatabase>,
  eventId: string,
  workerId: string,
): Promise<void> {
  try {
    const response = await fetchWithTimeout(
      `${config.BATCH_ORCHESTRATOR_URL.replace(/\/+$/, "")}/internal/batches/outbox/${encodeURIComponent(
        eventId,
      )}/ack`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      },
      2_000,
    );

    if (response.ok) {
      return;
    }
  } catch {
    // Fall through to direct DB ack for resilience.
  }

  await ackOutboxEvent(db, eventId, workerId);
}

async function failOutboxEvent(
  db: Kysely<HanaDatabase>,
  event: LeasedEvent,
  workerId: string,
  error: unknown,
): Promise<void> {
  const status = event.attempts >= 10 ? "dead_letter" : "failed";

  await db
    .updateTable("platform.outbox_events")
    .set({
      status,
      locked_at: null,
      locked_by: null,
      last_error: error instanceof Error ? error.message.slice(0, 500) : "worker_failed",
      next_attempt_at: status === "dead_letter" ? null : new Date(Date.now() + 60_000),
    })
    .where("id", "=", event.id)
    .where("status", "=", "processing")
    .where("locked_by", "=", workerId)
    .execute();
}

async function failOutboxEventWithBoundary(
  config: AppConfig,
  db: Kysely<HanaDatabase>,
  event: LeasedEvent,
  workerId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : "worker_failed";

  try {
    const response = await fetchWithTimeout(
      `${config.BATCH_ORCHESTRATOR_URL.replace(/\/+$/, "")}/internal/batches/outbox/${encodeURIComponent(
        event.id,
      )}/fail`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, error: message, retryAfterSeconds: 60 }),
      },
      2_000,
    );

    if (response.ok) {
      return;
    }
  } catch {
    // Fall through to direct DB fail for resilience.
  }

  await failOutboxEvent(db, event, workerId, error);
}

function parseLeasedEvent(value: unknown): LeasedEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const topic = payload["topic"];

  if (
    typeof payload["id"] !== "string" ||
    !isWorkerTopic(topic) ||
    typeof payload["attempts"] !== "number"
  ) {
    return null;
  }

  return {
    id: payload["id"],
    topic,
    payload_json: payload["payload_json"],
    attempts: payload["attempts"],
  };
}

function isWorkerTopic(value: unknown): value is WorkerTopic {
  return typeof value === "string" && (WORKER_TOPICS as readonly string[]).includes(value);
}

async function selectCharacterForProjection(db: Kysely<HanaDatabase>, characterId: string) {
  return db
    .selectFrom("creator.characters as characters")
    .innerJoin(
      "creator.character_versions as versions",
      "versions.id",
      "characters.current_version_id",
    )
    .select([
      "characters.id",
      "characters.creator_user_id",
      "characters.name",
      "characters.description",
      "characters.visibility",
      "characters.moderation_status",
      "characters.marketplace_category",
      "characters.model_profile",
      "characters.price_cents",
      "characters.monetization_enabled",
      "characters.updated_at",
      "versions.persona_prompt",
      "versions.greeting",
      "versions.scenario_prompt",
      "versions.speaking_style",
      "versions.personality_traits",
      "versions.rating",
      "versions.tags",
    ])
    .where("characters.id", "=", characterId)
    .executeTakeFirst();
}

async function qdrantUpsert(
  config: AppConfig,
  collection: string,
  point: { id: string; vector: number[]; payload: Record<string, unknown> },
): Promise<void> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${collection}/points?wait=true`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: [point] }),
    },
  );

  if (!response.ok) {
    throw new Error(`Qdrant upsert failed: HTTP ${response.status} ${await response.text()}`);
  }
}

async function qdrantDelete(config: AppConfig, collection: string, pointId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${qdrantBaseUrl(config)}/collections/${collection}/points/delete?wait=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: [pointId] }),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Qdrant delete failed: HTTP ${response.status} ${await response.text()}`);
  }
}

async function clickHouseInsert(
  config: AppConfig,
  table: string,
  row: Record<string, string | number>,
): Promise<void> {
  const url = new URL("/", config.CLICKHOUSE_URL);
  url.searchParams.set("user", config.CLICKHOUSE_USER);
  url.searchParams.set("password", config.CLICKHOUSE_PASSWORD);
  url.searchParams.set("query", `INSERT INTO ${table} FORMAT JSONEachRow`);

  const response = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-ndjson" },
    body: `${JSON.stringify(row)}\n`,
  });

  if (!response.ok) {
    throw new Error(`ClickHouse insert failed: HTTP ${response.status} ${await response.text()}`);
  }
}

function toClickHouseDateTime64(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function qdrantBaseUrl(config: AppConfig): string {
  return config.QDRANT_URL.replace(/\/+$/, "");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 5_000,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  return fetch(url, { ...init, signal: abortController.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

function payloadString(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object") {
    throw new DomainError("VALIDATION_FAILED", "Outbox payload must be an object");
  }

  const value = (payload as Record<string, unknown>)[key];

  if (typeof value !== "string" || !value) {
    throw new DomainError("VALIDATION_FAILED", "Outbox payload is missing a required id", {
      key,
    });
  }

  return value;
}

function payloadOptionalString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" && value ? value : null;
}

function parseSnapshotKind(value: string | null): StellarSnapshotKind {
  if (value === "conversation_memory" || value === "creator_soul_pack" || value === "user_export") {
    return value;
  }

  return "conversation_memory";
}

function embedTextForRetrieval(text: string): number[] {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token) {
      continue;
    }

    addFeature(vector, token, 1);

    const nextToken = tokens[index + 1];

    if (nextToken) {
      addFeature(vector, `${token} ${nextToken}`, 0.65);
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }

  return vector.map((value) => value / norm);
}

function addFeature(vector: number[], feature: string, weight: number): void {
  const digest = createHash("sha256").update(feature).digest();
  const dimension = digest.readUInt32BE(0) % VECTOR_SIZE;
  const sign = (digest[4] ?? 0) % 2 === 0 ? 1 : -1;
  const scaledWeight = weight * (1 + Math.log1p(feature.length));

  vector[dimension] = (vector[dimension] ?? 0) + sign * scaledWeight;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
