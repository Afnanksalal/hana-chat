ALTER TABLE billing.creator_earnings
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

UPDATE billing.creator_earnings
SET available_at = created_at + interval '7 days'
WHERE available_at IS NULL;

ALTER TABLE billing.creator_earnings
  ALTER COLUMN available_at SET DEFAULT (now() + interval '7 days'),
  ALTER COLUMN available_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creator_earnings_pending_available
  ON billing.creator_earnings (creator_user_id, status, available_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_messages_paid_trial_usage
  ON chat.messages (user_id, character_id, role, created_at DESC)
  WHERE role = 'user';

CREATE TABLE IF NOT EXISTS chat.conversation_evolution (
  conversation_id UUID PRIMARY KEY REFERENCES chat.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'warming', 'attuned', 'bonded')),
  relationship_depth INTEGER NOT NULL DEFAULT 0 CHECK (relationship_depth >= 0 AND relationship_depth <= 100),
  memory_count INTEGER NOT NULL DEFAULT 0 CHECK (memory_count >= 0),
  user_message_count INTEGER NOT NULL DEFAULT 0 CHECK (user_message_count >= 0),
  source_memory_ids UUID[] NOT NULL DEFAULT '{}',
  style_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL DEFAULT 'This character is still learning how this conversation should feel.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_evolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_evolution_user_character
  ON chat.conversation_evolution (user_id, character_id, updated_at DESC);
