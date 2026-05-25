export type GraphNodeLabel =
  | "User"
  | "Email"
  | "Device"
  | "IpAddress"
  | "Asn"
  | "PaymentMethod"
  | "Session"
  | "RiskDecision"
  | "Character"
  | "Conversation"
  | "MemoryFact"
  | "MemoryEvent"
  | "StoryArc"
  | "Preference"
  | "Boundary"
  | "Entity"
  | "Creator"
  | "Universe";

export interface GraphProjectionEvent {
  id: string;
  type:
    | "email_verified"
    | "device_seen"
    | "risk_decision_created"
    | "memory_fact_written"
    | "memory_superseded"
    | "conversation_event_written";
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface GraphConversationContextRequest {
  userId: string;
  characterId: string;
  conversationId: string;
  query: string;
  limit: number;
}

export interface GraphMemoryHit {
  memoryId: string;
  relationshipRelevance: number;
  currentTopicOverlap: number;
  reason: string;
}

export interface GraphConversationContext {
  source: "neo4j" | "postgres_fallback";
  promptContext: string;
  hits: GraphMemoryHit[];
  relationship: {
    userMessageCount: number;
    memoryCount: number;
    relationshipDepth: number;
    strongestKinds: string[];
    lastUpdatedAt: string | null;
  };
}

export const GRAPH_CONSTRAINTS = [
  "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (n:User) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT email_hash IF NOT EXISTS FOR (n:Email) REQUIRE n.hash IS UNIQUE",
  "CREATE CONSTRAINT device_id IF NOT EXISTS FOR (n:Device) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT character_id IF NOT EXISTS FOR (n:Character) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT conversation_id IF NOT EXISTS FOR (n:Conversation) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT memory_fact_id IF NOT EXISTS FOR (n:MemoryFact) REQUIRE n.id IS UNIQUE",
] as const;

export function buildEmailVerifiedCypher(): string {
  return `
MERGE (u:User {id: $userId})
MERGE (e:Email {hash: $emailHash})
SET e.domain = $emailDomain,
    e.updatedAt = $occurredAt
MERGE (u)-[r:VERIFIED_EMAIL]->(e)
SET r.verifiedAt = $occurredAt
`;
}

export function buildDeviceSeenCypher(): string {
  return `
MERGE (u:User {id: $userId})
MERGE (d:Device {id: $deviceId})
SET d.updatedAt = $occurredAt
MERGE (u)-[r:USED_DEVICE]->(d)
SET r.lastSeenAt = $occurredAt
`;
}

export function buildConversationContextCypher(): string {
  return `
MATCH (u:User {id: $userId})
MATCH (ch:Character {id: $characterId})
MATCH (conv:Conversation {id: $conversationId})
OPTIONAL MATCH (u)-[rel:RELATES_TO]->(ch)
OPTIONAL MATCH (conv)-[:CONTAINS_MEMORY]->(m:MemoryFact)<-[:OWNS_MEMORY]-(u)
WHERE m IS NULL OR (
  m.scope = 'conversation'
  AND coalesce(m.isActive, false) = true
  AND NOT coalesce(m.kind, '') IN ['safety', 'system']
  AND EXISTS { MATCH (ch)-[:HAS_MEMORY]->(m) }
)
WITH conv, rel, m
ORDER BY coalesce(m.importance, 0.0) DESC, coalesce(m.updatedAt, '') DESC
RETURN
  coalesce(conv.userMessageCount, 0) AS userMessageCount,
  coalesce(rel.updatedAt, conv.updatedAt, '') AS lastUpdatedAt,
  collect(
    CASE WHEN m IS NULL THEN null ELSE {
      memoryId: m.id,
      kind: coalesce(m.kind, 'event'),
      importance: coalesce(m.importance, 0.5),
      confidence: coalesce(m.confidence, 0.5),
      updatedAt: coalesce(m.updatedAt, '')
    } END
  )[0..$limit] AS memories
`;
}

export function buildGraphPromptContext(input: GraphConversationContext): string {
  const lines = [
    "Graph personalization:",
    `- Source: ${input.source === "neo4j" ? "relationship graph" : "canonical memory fallback"}`,
    `- Same conversation only: ${input.relationship.memoryCount} active memories and ${input.relationship.userMessageCount} user turns.`,
    `- Relationship depth signal: ${input.relationship.relationshipDepth}/100.`,
  ];

  if (input.relationship.strongestKinds.length) {
    lines.push(`- Strongest continuity types: ${input.relationship.strongestKinds.join(", ")}.`);
  }

  if (input.hits.length) {
    lines.push(
      "- Graph-relevant memories are already listed in the saved context. Use them naturally without mentioning the graph.",
    );
  } else {
    lines.push("- No graph-relevant memories are ready yet. Let continuity grow from this room.");
  }

  return lines.join("\n");
}

export function scoreGraphRelationship(input: {
  userMessageCount: number;
  memoryCount: number;
  averageImportance: number;
  averageConfidence: number;
}): number {
  const depth =
    input.userMessageCount * 2.2 +
    input.memoryCount * 5 +
    input.averageImportance * 18 +
    input.averageConfidence * 10;

  return Math.max(0, Math.min(100, Math.round(depth)));
}
