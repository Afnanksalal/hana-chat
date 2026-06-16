import { loadConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import {
  GRAPH_CONSTRAINTS,
  buildConversationContextCypher,
  buildDeviceSeenCypher,
  buildEmailVerifiedCypher,
  buildGraphPromptContext,
  scoreGraphRelationship,
  type GraphConversationContext,
  type GraphMemoryHit,
} from "@hana/graph-core";
import { Body, Controller, Get, OnModuleDestroy, Post } from "@nestjs/common";
import neo4j, { type Driver } from "neo4j-driver";
import { z } from "zod";

const ConversationContextSchema = z.object({
  userId: z.string().uuid(),
  characterId: z.string().uuid(),
  conversationId: z.string().uuid(),
  query: z.string().max(4_000).default(""),
  limit: z.coerce.number().int().min(1).max(40).default(12),
});

interface GraphMemorySignal {
  memoryId: string;
  kind: string;
  importance: number;
  confidence: number;
  updatedAt: string | null;
}

interface Neo4jConversationSignals {
  userMessageCount: number;
  lastUpdatedAt: string | null;
  memories: GraphMemorySignal[];
}

interface MemoryRow {
  id: string;
  kind: string;
  text: string;
  importance: number;
  confidence: number;
  emotional_weight: number;
  updated_at: Date;
}

@Controller("/internal/graph")
export class GraphController implements OnModuleDestroy {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);
  private readonly driver: Driver = neo4j.driver(
    this.config.NEO4J_URI,
    neo4j.auth.basic(this.config.NEO4J_USER, this.config.NEO4J_PASSWORD),
  );

  public async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.driver.close(), this.db.destroy()]);
  }

  @Get("/constraints")
  public constraints() {
    return {
      constraints: GRAPH_CONSTRAINTS,
    };
  }

  @Get("/projection-templates")
  public projectionTemplates() {
    return {
      emailVerified: buildEmailVerifiedCypher(),
      deviceSeen: buildDeviceSeenCypher(),
      conversationContext: buildConversationContextCypher(),
    };
  }

  @Post("/conversation-context")
  public async conversationContext(@Body() body: unknown): Promise<GraphConversationContext> {
    const input = ConversationContextSchema.parse(body);
    const graphSignals = await this.readNeo4jSignals(input).catch(() => null);
    const graphMemoryIds = graphSignals?.memories.map((memory) => memory.memoryId) ?? [];
    const rows =
      graphMemoryIds.length > 0
        ? await this.selectMemoriesById(input, graphMemoryIds)
        : await this.selectFallbackMemories(input);
    const orderedRows = orderRows(rows, graphMemoryIds).slice(0, input.limit);
    const userMessageCount =
      graphSignals?.userMessageCount && graphSignals.userMessageCount > 0
        ? graphSignals.userMessageCount
        : await this.countUserMessages(input);
    const source =
      graphMemoryIds.length > 0 || (graphSignals && orderedRows.length === 0)
        ? "neo4j"
        : "postgres_fallback";
    const context = buildContext({
      source,
      rows: orderedRows,
      query: input.query,
      userMessageCount,
      lastUpdatedAt: graphSignals?.lastUpdatedAt ?? latestMemoryTimestamp(orderedRows),
    });

    return {
      ...context,
      promptContext: buildGraphPromptContext(context),
    };
  }

  private async readNeo4jSignals(
    input: z.infer<typeof ConversationContextSchema>,
  ): Promise<Neo4jConversationSignals | null> {
    const session = this.driver.session();

    try {
      const result = await session.executeRead((tx) =>
        tx.run(buildConversationContextCypher(), {
          userId: input.userId,
          characterId: input.characterId,
          conversationId: input.conversationId,
          limit: neo4j.int(input.limit),
        }),
      );
      const record = result.records[0];

      if (!record) {
        return null;
      }

      return {
        userMessageCount: toNumber(record.get("userMessageCount")),
        lastUpdatedAt: nullableString(record.get("lastUpdatedAt")),
        memories: parseGraphMemories(record.get("memories")),
      };
    } finally {
      await session.close();
    }
  }

  private async selectMemoriesById(
    input: z.infer<typeof ConversationContextSchema>,
    memoryIds: string[],
  ): Promise<MemoryRow[]> {
    if (memoryIds.length === 0) {
      return [];
    }

    return this.db
      .selectFrom("memory.facts")
      .select(["id", "kind", "text", "importance", "confidence", "emotional_weight", "updated_at"])
      .where("id", "in", memoryIds)
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("scope", "=", "conversation")
      .where("kind", "not in", ["safety", "system"])
      .where("is_active", "=", true)
      .execute();
  }

  private async selectFallbackMemories(
    input: z.infer<typeof ConversationContextSchema>,
  ): Promise<MemoryRow[]> {
    return this.db
      .selectFrom("memory.facts")
      .select(["id", "kind", "text", "importance", "confidence", "emotional_weight", "updated_at"])
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("scope", "=", "conversation")
      .where("kind", "not in", ["safety", "system"])
      .where("is_active", "=", true)
      .orderBy("importance", "desc")
      .orderBy("updated_at", "desc")
      .limit(input.limit)
      .execute();
  }

  private async countUserMessages(
    input: z.infer<typeof ConversationContextSchema>,
  ): Promise<number> {
    const row = await this.db
      .selectFrom("chat.messages")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", input.userId)
      .where("character_id", "=", input.characterId)
      .where("conversation_id", "=", input.conversationId)
      .where("role", "=", "user")
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }
}

function buildContext(input: {
  source: GraphConversationContext["source"];
  rows: MemoryRow[];
  query: string;
  userMessageCount: number;
  lastUpdatedAt: string | null;
}): GraphConversationContext {
  const averageImportance = average(input.rows.map((row) => row.importance));
  const averageConfidence = average(input.rows.map((row) => row.confidence));
  const relationshipDepth = scoreGraphRelationship({
    userMessageCount: input.userMessageCount,
    memoryCount: input.rows.length,
    averageImportance,
    averageConfidence,
  });
  const context: GraphConversationContext = {
    source: input.source,
    promptContext: "",
    hits: input.rows.map((row) => toGraphHit(row, input.query)),
    relationship: {
      userMessageCount: input.userMessageCount,
      memoryCount: input.rows.length,
      relationshipDepth,
      strongestKinds: strongestKinds(input.rows),
      lastUpdatedAt: input.lastUpdatedAt,
    },
  };

  return context;
}

function toGraphHit(row: MemoryRow, query: string): GraphMemoryHit {
  const relationshipRelevance = clamp01(
    0.28 +
      row.importance * 0.34 +
      row.confidence * 0.14 +
      row.emotional_weight * 0.14 +
      kindBoost(row.kind),
  );
  const currentTopicOverlap = clamp01(0.25 + lexicalOverlap(query, row.text) * 0.75);

  return {
    memoryId: row.id,
    relationshipRelevance,
    currentTopicOverlap,
    reason: `${row.kind} memory inside this exact room`,
  };
}

function parseGraphMemories(value: unknown): GraphMemorySignal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const memories: GraphMemorySignal[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const memoryId = nullableString(record["memoryId"]);

    if (!memoryId) {
      continue;
    }

    memories.push({
      memoryId,
      kind: nullableString(record["kind"]) ?? "event",
      importance: toNumber(record["importance"], 0.5),
      confidence: toNumber(record["confidence"], 0.5),
      updatedAt: nullableString(record["updatedAt"]),
    });
  }

  return memories;
}

function orderRows(rows: MemoryRow[], orderedIds: string[]): MemoryRow[] {
  if (orderedIds.length === 0) {
    return rows;
  }

  const indexById = new Map(orderedIds.map((id, index) => [id, index]));

  return [...rows].sort(
    (left, right) =>
      (indexById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (indexById.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function strongestKinds(rows: MemoryRow[]): string[] {
  const counts = new Map<string, { count: number; importance: number }>();

  for (const row of rows) {
    const current = counts.get(row.kind) ?? { count: 0, importance: 0 };
    counts.set(row.kind, {
      count: current.count + 1,
      importance: Math.max(current.importance, row.importance),
    });
  }

  return [...counts.entries()]
    .sort(
      (left, right) => right[1].count - left[1].count || right[1].importance - left[1].importance,
    )
    .slice(0, 5)
    .map(([kind]) => kind);
}

function latestMemoryTimestamp(rows: MemoryRow[]): string | null {
  const latest = rows
    .map((row) => row.updated_at.getTime())
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => right - left)[0];

  return latest ? new Date(latest).toISOString() : null;
}

function lexicalOverlap(query: string, text: string): number {
  const queryTokens = new Set(tokenize(query));
  const textTokens = new Set(tokenize(text));

  if (queryTokens.size === 0 || textTokens.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.sqrt(queryTokens.size * textTokens.size);
}

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g)
      ?.slice(0, 80) ?? []
  );
}

function kindBoost(kind: string): number {
  switch (kind) {
    case "relationship":
      return 0.12;
    case "preference":
    case "boundary":
    case "style":
      return 0.1;
    case "canon":
    case "event":
      return 0.08;
    default:
      return 0.04;
  }
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value && typeof value === "object" && "toNumber" in value) {
    const toNumberValue = (value as { toNumber?: () => number }).toNumber?.();

    if (typeof toNumberValue === "number" && Number.isFinite(toNumberValue)) {
      return toNumberValue;
    }
  }

  return fallback;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DomainError("VALIDATION_FAILED", "Graph score must be finite");
  }

  return Math.max(0, Math.min(1, value));
}
