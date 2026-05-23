# Qdrant Collections

Qdrant is the semantic retrieval projection. PostgreSQL remains canonical.

Initial collections:

- `memory_facts`
- `memory_events`
- `character_cards`
- `conversation_turns_hot`
- `safety_patterns`

Every point ID should be deterministic from the canonical PostgreSQL ID.

Required payload fields:

- `memoryId`
- `userId`
- `characterId`
- `conversationId`
- `scope`
- `kind`
- `importance`
- `confidence`
- `emotionalWeight`
- `createdAt`
- `updatedAt`
- `isActive`
- `source`
