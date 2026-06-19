import { loadConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";
import { auditEvent, requireAdmin, requireSession } from "./session";
import { enqueueOutboxEvent, eventKey } from "./outbox";

const QueueConversationSnapshotRequestSchema = z.object({
  conversationId: z.string().uuid(),
});

@Controller("/v1/og/memory")
export class OgMemoryController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/vault")
  public async vault(
    @Headers("authorization") authorization?: string,
    @Query("limit") limit?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const snapshotLimit = clampLimit(limit, 50);
    const [summaryRows, rooms, snapshots] = await Promise.all([
      this.db
        .selectFrom("memory.decentralized_snapshots")
        .select(["status", sql<number>`COUNT(*)::integer`.as("count")])
        .where("user_id", "=", session.userId)
        .groupBy("status")
        .execute(),
      this.db
        .selectFrom("memory.facts as memories")
        .innerJoin("creator.characters as characters", "characters.id", "memories.character_id")
        .select([
          "memories.character_id",
          "memories.conversation_id",
          "characters.name as character_name",
          "characters.avatar_url as character_avatar_url",
          sql<number>`COUNT(*)::integer`.as("memory_count"),
          sql<Date>`MAX(memories.updated_at)`.as("latest_memory_at"),
        ])
        .where("memories.user_id", "=", session.userId)
        .where("memories.scope", "=", "conversation")
        .where("memories.is_active", "=", true)
        .where("memories.conversation_id", "is not", null)
        .groupBy([
          "memories.character_id",
          "memories.conversation_id",
          "characters.name",
          "characters.avatar_url",
        ])
        .orderBy(sql`MAX(memories.updated_at)`, "desc")
        .limit(25)
        .execute(),
      this.db
        .selectFrom("memory.decentralized_snapshots as snapshots")
        .leftJoin("creator.characters as characters", "characters.id", "snapshots.character_id")
        .select([
          "snapshots.id",
          "snapshots.snapshot_kind",
          "snapshots.storage_network",
          "snapshots.root_hash",
          "snapshots.tx_hash",
          "snapshots.manifest_hash",
          "snapshots.encryption_mode",
          "snapshots.status",
          "snapshots.source_memory_ids",
          "snapshots.failure_reason",
          "snapshots.created_at",
          "snapshots.updated_at",
          "snapshots.confirmed_at",
          "snapshots.character_id",
          "snapshots.conversation_id",
          "characters.name as character_name",
        ])
        .where("snapshots.user_id", "=", session.userId)
        .orderBy("snapshots.created_at", "desc")
        .limit(snapshotLimit)
        .execute(),
    ]);

    const statusCounts = summaryRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = Number(row.count);
      return counts;
    }, {});

    return {
      settings: {
        ogEnabled: this.config.OG_ENABLED,
        storageEnabled: this.config.OG_STORAGE_ENABLED,
        uploadEnabled: this.config.OG_STORAGE_UPLOAD_ENABLED,
        network: this.config.OG_NETWORK,
      },
      summary: {
        snapshots: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        uploadedSnapshots: statusCounts["uploaded"] ?? 0,
        confirmedSnapshots: statusCounts["confirmed"] ?? 0,
        failedSnapshots: statusCounts["failed"] ?? 0,
        pendingSnapshots: statusCounts["pending_upload"] ?? 0,
        roomsWithMemory: rooms.length,
      },
      rooms: rooms.map((room) => ({
        conversationId: room.conversation_id,
        characterId: room.character_id,
        characterName: room.character_name,
        characterAvatarUrl: room.character_avatar_url,
        memoryCount: Number(room.memory_count),
        latestMemoryAt: toIso(room.latest_memory_at),
      })),
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        kind: snapshot.snapshot_kind,
        network: snapshot.storage_network,
        rootHash: snapshot.root_hash,
        txHash: snapshot.tx_hash,
        manifestHash: snapshot.manifest_hash,
        encryptionMode: snapshot.encryption_mode,
        status: snapshot.status,
        sourceMemoryCount: snapshot.source_memory_ids.length,
        failureReason: snapshot.failure_reason,
        characterId: snapshot.character_id,
        conversationId: snapshot.conversation_id,
        characterName: snapshot.character_name,
        createdAt: snapshot.created_at.toISOString(),
        updatedAt: snapshot.updated_at.toISOString(),
        confirmedAt: snapshot.confirmed_at?.toISOString() ?? null,
      })),
    };
  }

  @Get("/snapshots/:snapshotId")
  public async snapshot(
    @Param("snapshotId") snapshotId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const snapshot = await this.db
      .selectFrom("memory.decentralized_snapshots")
      .selectAll()
      .where("id", "=", snapshotId)
      .where("user_id", "=", session.userId)
      .executeTakeFirst();

    if (!snapshot) {
      throw new DomainError("RESOURCE_NOT_FOUND", "0G memory snapshot not found");
    }

    return {
      snapshot: {
        id: snapshot.id,
        kind: snapshot.snapshot_kind,
        network: snapshot.storage_network,
        rootHash: snapshot.root_hash,
        txHash: snapshot.tx_hash,
        manifestHash: snapshot.manifest_hash,
        encryptionMode: snapshot.encryption_mode,
        status: snapshot.status,
        sourceMemoryIds: snapshot.source_memory_ids,
        manifest: snapshot.manifest_json,
        failureReason: snapshot.failure_reason,
        createdAt: snapshot.created_at.toISOString(),
        updatedAt: snapshot.updated_at.toISOString(),
      },
    };
  }

  @Post("/snapshots")
  public async queueConversationSnapshot(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = QueueConversationSnapshotRequestSchema.parse(body);
    const conversation = await this.db
      .selectFrom("chat.conversations")
      .select(["id", "character_id"])
      .where("id", "=", input.conversationId)
      .where("user_id", "=", session.userId)
      .executeTakeFirst();

    if (!conversation) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Conversation not found");
    }

    const activeMemoryCount = await this.activeConversationMemoryCount({
      userId: session.userId,
      characterId: conversation.character_id,
      conversationId: conversation.id,
    });

    if (activeMemoryCount === 0) {
      throw new DomainError("CONFLICT", "This room has no active memory to snapshot yet");
    }

    await enqueueOutboxEvent(this.db, {
      topic: "memory.snapshot.requested",
      key: eventKey(conversation.id),
      idempotencyKey: `memory.snapshot.manual:${conversation.id}:${Date.now()}`,
      payload: {
        snapshotKind: "conversation_memory",
        userId: session.userId,
        characterId: conversation.character_id,
        conversationId: conversation.id,
        reason: "user_memory_vault",
      },
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "og.memory.snapshot.queue",
      resourceType: "chat.conversation",
      resourceId: conversation.id,
      metadata: { activeMemoryCount },
    });

    return { queued: true, conversationId: conversation.id, activeMemoryCount };
  }

  @Post("/exports")
  public async queueUserExport(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const activeMemoryCount = await this.db
      .selectFrom("memory.facts")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", session.userId)
      .where("is_active", "=", true)
      .executeTakeFirst();
    const count = Number(activeMemoryCount?.count ?? 0);

    if (count === 0) {
      throw new DomainError("CONFLICT", "No active memories are available for export yet");
    }

    await enqueueOutboxEvent(this.db, {
      topic: "memory.snapshot.requested",
      key: eventKey(session.userId),
      idempotencyKey: `memory.export.manual:${session.userId}:${Date.now()}`,
      payload: {
        snapshotKind: "user_export",
        userId: session.userId,
        reason: "user_memory_export",
      },
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "og.memory.export.queue",
      resourceType: "identity.user",
      resourceId: session.userId,
      metadata: { activeMemoryCount: count },
    });

    return { queued: true, activeMemoryCount: count };
  }

  @Post("/creator-soul-packs/:characterId")
  public async queueCreatorSoulPack(
    @Param("characterId") characterId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const character = await this.db
      .selectFrom("creator.characters")
      .select(["id", "creator_user_id", "current_version_id"])
      .where("id", "=", characterId)
      .executeTakeFirst();

    if (!character || character.creator_user_id !== session.userId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Creator character not found");
    }

    if (!character.current_version_id) {
      throw new DomainError("CONFLICT", "Character has no current version to archive");
    }

    await enqueueOutboxEvent(this.db, {
      topic: "memory.snapshot.requested",
      key: eventKey(character.id),
      idempotencyKey: `creator.soul_pack.manual:${character.id}:${Date.now()}`,
      payload: {
        snapshotKind: "creator_soul_pack",
        userId: session.userId,
        characterId: character.id,
        reason: "creator_soul_pack",
      },
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "og.creator_soul_pack.queue",
      resourceType: "creator.character",
      resourceId: character.id,
    });

    return { queued: true, characterId: character.id };
  }

  private async activeConversationMemoryCount(input: {
    userId: string;
    characterId: string;
    conversationId: string;
  }): Promise<number> {
    const result = await this.db
      .selectFrom("memory.facts")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("scope", "=", "conversation")
      .where("is_active", "=", true)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }
}

@Controller("/v1/admin/og/memory")
export class AdminOgMemoryController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get()
  public async status(@Headers("authorization") authorization?: string) {
    await requireAdmin(this.db, this.config, authorization);
    const [statusRows, recentSnapshots, outboxRows] = await Promise.all([
      this.db
        .selectFrom("memory.decentralized_snapshots")
        .select(["snapshot_kind", "status", sql<number>`COUNT(*)::integer`.as("count")])
        .groupBy(["snapshot_kind", "status"])
        .execute(),
      this.db
        .selectFrom("memory.decentralized_snapshots as snapshots")
        .leftJoin("identity.users as users", "users.id", "snapshots.user_id")
        .leftJoin("creator.characters as characters", "characters.id", "snapshots.character_id")
        .select([
          "snapshots.id",
          "snapshots.snapshot_kind",
          "snapshots.status",
          "snapshots.storage_network",
          "snapshots.root_hash",
          "snapshots.tx_hash",
          "snapshots.failure_reason",
          "snapshots.created_at",
          "snapshots.updated_at",
          "users.display_name as user_display_name",
          "characters.name as character_name",
        ])
        .orderBy("snapshots.updated_at", "desc")
        .limit(20)
        .execute(),
      this.db
        .selectFrom("platform.outbox_events")
        .select(["status", sql<number>`COUNT(*)::integer`.as("count")])
        .where("topic", "=", "memory.snapshot.requested")
        .groupBy("status")
        .execute(),
    ]);
    const totals = {
      snapshots: 0,
      uploaded: 0,
      confirmed: 0,
      failed: 0,
      pending: 0,
      conversationMemory: 0,
      userExports: 0,
      creatorSoulPacks: 0,
    };

    for (const row of statusRows) {
      const count = Number(row.count);
      totals.snapshots += count;

      if (row.status === "uploaded") {
        totals.uploaded += count;
      } else if (row.status === "confirmed") {
        totals.confirmed += count;
      } else if (row.status === "failed") {
        totals.failed += count;
      } else if (row.status === "pending_upload") {
        totals.pending += count;
      }

      if (row.snapshot_kind === "conversation_memory") {
        totals.conversationMemory += count;
      } else if (row.snapshot_kind === "user_export") {
        totals.userExports += count;
      } else if (row.snapshot_kind === "creator_soul_pack") {
        totals.creatorSoulPacks += count;
      }
    }

    return {
      settings: {
        ogEnabled: this.config.OG_ENABLED,
        storageEnabled: this.config.OG_STORAGE_ENABLED,
        uploadEnabled: this.config.OG_STORAGE_UPLOAD_ENABLED,
        network: this.config.OG_NETWORK,
        indexerUrl: this.config.OG_STORAGE_INDEXER_URL,
      },
      totals,
      outbox: outboxRows.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      recentSnapshots: recentSnapshots.map((snapshot) => ({
        id: snapshot.id,
        kind: snapshot.snapshot_kind,
        status: snapshot.status,
        network: snapshot.storage_network,
        rootHash: snapshot.root_hash,
        txHash: snapshot.tx_hash,
        failureReason: snapshot.failure_reason,
        userDisplayName: snapshot.user_display_name ?? "Unknown user",
        characterName: snapshot.character_name,
        createdAt: snapshot.created_at.toISOString(),
        updatedAt: snapshot.updated_at.toISOString(),
      })),
    };
  }
}

function clampLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(1, parsed));
}

function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
