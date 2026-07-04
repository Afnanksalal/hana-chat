ALTER TABLE chat.conversations
  ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'mentions';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_conversation_type_check'
      AND conrelid = 'chat.conversations'::regclass
  ) THEN
    ALTER TABLE chat.conversations
      ADD CONSTRAINT conversations_conversation_type_check
      CHECK (conversation_type IN ('direct', 'group'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_response_mode_check'
      AND conrelid = 'chat.conversations'::regclass
  ) THEN
    ALTER TABLE chat.conversations
      ADD CONSTRAINT conversations_response_mode_check
      CHECK (response_mode IN ('mentions'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chat.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES chat.conversations(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  mention_slug TEXT NOT NULL CHECK (mention_slug ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, character_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_participants_position
  ON chat.conversation_participants (conversation_id, position)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_participants_mention
  ON chat.conversation_participants (conversation_id, mention_slug)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_conversation_participants_character
  ON chat.conversation_participants (character_id, conversation_id)
  WHERE status = 'active';

ALTER TABLE chat.conversation_evolution
  DROP CONSTRAINT IF EXISTS conversation_evolution_pkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_evolution_conversation_character_key'
      AND conrelid = 'chat.conversation_evolution'::regclass
  ) THEN
    ALTER TABLE chat.conversation_evolution
      ADD CONSTRAINT conversation_evolution_conversation_character_key
      UNIQUE (conversation_id, character_id);
  END IF;
END $$;

INSERT INTO chat.conversation_participants (
  conversation_id,
  character_id,
  position,
  mention_slug,
  status
)
SELECT
  conversations.id,
  conversations.character_id,
  0,
  COALESCE(
    NULLIF(
      LEFT(
        REGEXP_REPLACE(
          LOWER(COALESCE(characters.name, 'character')),
          '[^a-z0-9]+',
          '',
          'g'
        ),
        32
      ),
      ''
    ),
    'character'
  ),
  'active'
FROM chat.conversations AS conversations
INNER JOIN creator.characters AS characters
  ON characters.id = conversations.character_id
WHERE NOT EXISTS (
  SELECT 1
  FROM chat.conversation_participants AS participants
  WHERE participants.conversation_id = conversations.id
    AND participants.character_id = conversations.character_id
);
