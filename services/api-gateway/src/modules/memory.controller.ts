import { loadConfig } from "@hana/config";
import { UpdateMemoryRequestSchema } from "@hana/contracts";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { classifyTextSafety } from "@hana/safety-core";
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { upsertConversationEvolution } from "./conversation-evolution";
import {
  memoryProjectionColumns,
  projectMemoryDelete,
  projectMemoryUpsert,
} from "./memory-projection";
import { auditEvent, requireSession } from "./session";

const CreateMemoryRequestSchema = z.object({
  text: z.string().min(1).max(1_000),
  characterId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  kind: z
    .enum(["preference", "boundary", "relationship", "canon", "event", "style"])
    .default("preference"),
  importance: z.number().min(0).max(1).default(0.6),
});

@Controller("/v1/memories")
export class MemoryController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get()
  public async list(
    @Headers("authorization") authorization?: string,
    @Query("characterId") characterId?: string,
    @Query("conversationId") conversationId?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    let query = this.db
      .selectFrom("memory.facts")
      .select([
        "id",
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
      ])
      .where("user_id", "=", session.userId)
      .where("scope", "=", "conversation")
      .where("conversation_id", "is not", null)
      .orderBy("importance", "desc")
      .orderBy("updated_at", "desc")
      .limit(100);

    if (characterId) {
      query = query.where("character_id", "=", characterId);
    }

    if (conversationId) {
      query = query.where("conversation_id", "=", conversationId);
    }

    const memories = await query.execute();

    return {
      memories: memories.map((memory) => ({
        id: memory.id,
        characterId: memory.character_id,
        conversationId: memory.conversation_id,
        scope: memory.scope,
        kind: memory.kind,
        text: memory.text,
        confidence: memory.confidence,
        importance: memory.importance,
        emotionalWeight: memory.emotional_weight,
        createdAt: memory.created_at.toISOString(),
        updatedAt: memory.updated_at.toISOString(),
        isActive: memory.is_active,
      })),
    };
  }

  @Post()
  public async create(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateMemoryRequestSchema.parse(body);
    assertMemorySafety(input.text);
    await this.ensureCharacterVisible(input.characterId, session.userId);
    const conversationId =
      input.conversationId ??
      (
        await this.db
          .insertInto("chat.conversations")
          .values({
            user_id: session.userId,
            character_id: input.characterId,
            status: "active",
          })
          .returning(["id"])
          .executeTakeFirstOrThrow()
      ).id;
    await this.ensureConversationOwner(conversationId, session.userId, input.characterId);

    const memory = await this.db
      .insertInto("memory.facts")
      .values({
        user_id: session.userId,
        character_id: input.characterId,
        conversation_id: conversationId,
        scope: "conversation",
        kind: input.kind,
        text: input.text,
        normalized_text: input.text.toLowerCase(),
        confidence: 1,
        importance: input.importance,
        emotional_weight: 0.4,
        source_message_ids: [],
        is_active: true,
      })
      .returning(memoryProjectionColumns)
      .executeTakeFirstOrThrow();

    await projectMemoryUpsert({
      db: this.db,
      config: this.config,
      memory,
      actorUserId: session.userId,
      action: "create",
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "memory.create",
      resourceType: "memory.fact",
      resourceId: memory.id,
    });
    const evolution = await upsertConversationEvolution(this.db, {
      userId: session.userId,
      characterId: input.characterId,
      conversationId,
    });

    return { id: memory.id, characterId: input.characterId, conversationId, evolution };
  }

  @Patch("/:memoryId")
  public async update(
    @Param("memoryId") memoryId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = UpdateMemoryRequestSchema.parse(body);
    await this.ensureOwner(memoryId, session.userId);
    if (input.text !== undefined) {
      assertMemorySafety(input.text);
    }

    const updated = await this.db
      .updateTable("memory.facts")
      .set({
        ...(input.text !== undefined
          ? { text: input.text, normalized_text: input.text.toLowerCase() }
          : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", memoryId)
      .returning(memoryProjectionColumns)
      .executeTakeFirstOrThrow();

    if (updated.is_active) {
      await projectMemoryUpsert({
        db: this.db,
        config: this.config,
        memory: updated,
        actorUserId: session.userId,
        action: "update",
      });
    } else {
      await projectMemoryDelete({
        db: this.db,
        config: this.config,
        memory: updated,
        actorUserId: session.userId,
      });
    }

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "memory.update",
      resourceType: "memory.fact",
      resourceId: memoryId,
      metadata: input,
    });
    const evolution =
      updated.character_id && updated.conversation_id
        ? await upsertConversationEvolution(this.db, {
            userId: session.userId,
            characterId: updated.character_id,
            conversationId: updated.conversation_id,
          })
        : null;

    return {
      id: updated.id,
      text: updated.text,
      importance: updated.importance,
      isActive: updated.is_active,
      updatedAt: updated.updated_at.toISOString(),
      evolution,
    };
  }

  @Delete("/:memoryId")
  public async remove(
    @Param("memoryId") memoryId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    await this.ensureOwner(memoryId, session.userId);

    const deleted = await this.db
      .updateTable("memory.facts")
      .set({ is_active: false, updated_at: new Date() })
      .where("id", "=", memoryId)
      .returning(memoryProjectionColumns)
      .executeTakeFirstOrThrow();

    await projectMemoryDelete({
      db: this.db,
      config: this.config,
      memory: deleted,
      actorUserId: session.userId,
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "memory.delete",
      resourceType: "memory.fact",
      resourceId: memoryId,
    });
    const evolution =
      deleted.character_id && deleted.conversation_id
        ? await upsertConversationEvolution(this.db, {
            userId: session.userId,
            characterId: deleted.character_id,
            conversationId: deleted.conversation_id,
          })
        : null;

    return { ok: true, evolution };
  }

  private async ensureOwner(memoryId: string, userId: string): Promise<void> {
    const memory = await this.db
      .selectFrom("memory.facts")
      .select(["id"])
      .where("id", "=", memoryId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!memory) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Memory not found");
    }
  }

  private async ensureConversationOwner(
    conversationId: string,
    userId: string,
    characterId: string,
  ): Promise<void> {
    const conversation = await this.db
      .selectFrom("chat.conversations")
      .select(["id"])
      .where("id", "=", conversationId)
      .where("user_id", "=", userId)
      .where("character_id", "=", characterId)
      .executeTakeFirst();

    if (!conversation) {
      throw new DomainError("AUTH_FORBIDDEN", "Conversation does not belong to this user");
    }
  }

  private async ensureCharacterVisible(characterId: string, userId: string): Promise<void> {
    const character = await this.db
      .selectFrom("creator.characters")
      .select(["id", "creator_user_id", "visibility", "moderation_status"])
      .where("id", "=", characterId)
      .executeTakeFirst();

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    if (character.visibility !== "public" && character.creator_user_id !== userId) {
      throw new DomainError("AUTH_FORBIDDEN", "Character is private");
    }

    if (character.moderation_status !== "approved" && character.creator_user_id !== userId) {
      throw new DomainError("AUTH_FORBIDDEN", "Character is not approved");
    }
  }
}

function assertMemorySafety(text: string): void {
  const decision = classifyTextSafety(text, {
    adultModeEnabled: true,
    userIsAdult: true,
    characterRating: "teen",
  });

  if (decision.action !== "allow") {
    throw new DomainError("SAFETY_BLOCKED", "Memory text failed safety checks", {
      reasonCode: decision.reasonCode,
      categories: decision.categories,
    });
  }
}
