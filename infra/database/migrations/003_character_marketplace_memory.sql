ALTER TABLE creator.characters
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT,
  ADD COLUMN IF NOT EXISTS marketplace_category TEXT NOT NULL DEFAULT 'featured',
  ADD COLUMN IF NOT EXISTS marketplace_preview TEXT,
  ADD COLUMN IF NOT EXISTS model_profile TEXT NOT NULL DEFAULT 'balanced';

ALTER TABLE creator.character_versions
  ADD COLUMN IF NOT EXISTS scenario_prompt TEXT,
  ADD COLUMN IF NOT EXISTS first_message_style TEXT,
  ADD COLUMN IF NOT EXISTS creator_notes TEXT,
  ADD COLUMN IF NOT EXISTS personality_traits TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS speaking_style TEXT,
  ADD COLUMN IF NOT EXISTS memory_scope TEXT NOT NULL DEFAULT 'conversation';

CREATE INDEX IF NOT EXISTS idx_characters_marketplace_category
  ON creator.characters (marketplace_category, visibility, moderation_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_facts_conversation_active
  ON memory.facts (user_id, character_id, conversation_id, is_active, importance DESC);

UPDATE memory.facts
SET scope = 'conversation'
WHERE conversation_id IS NOT NULL
  AND scope IN ('global_user', 'user_character');
