export type GraphNodeLabel =
  | "User"
  | "Phone"
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
    | "phone_verified"
    | "device_seen"
    | "risk_decision_created"
    | "memory_fact_written"
    | "memory_superseded"
    | "conversation_event_written";
  occurredAt: string;
  payload: Record<string, unknown>;
}

export const GRAPH_CONSTRAINTS = [
  "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (n:User) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT phone_hash IF NOT EXISTS FOR (n:Phone) REQUIRE n.hash IS UNIQUE",
  "CREATE CONSTRAINT device_id IF NOT EXISTS FOR (n:Device) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT character_id IF NOT EXISTS FOR (n:Character) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT memory_fact_id IF NOT EXISTS FOR (n:MemoryFact) REQUIRE n.id IS UNIQUE",
] as const;

export function buildPhoneVerifiedCypher(): string {
  return `
MERGE (u:User {id: $userId})
MERGE (p:Phone {hash: $phoneHash})
SET p.countryCode = $countryCode,
    p.lineType = $lineType,
    p.updatedAt = $occurredAt
MERGE (u)-[r:VERIFIED_PHONE]->(p)
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
