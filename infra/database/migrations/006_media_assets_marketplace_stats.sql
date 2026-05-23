CREATE TABLE IF NOT EXISTS creator.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purpose TEXT NOT NULL CHECK (purpose IN ('character_avatar', 'character_cover', 'user_avatar')),
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256_hex TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created
  ON creator.media_assets (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_purpose_created
  ON creator.media_assets (purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS creator.character_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  actor_user_id UUID REFERENCES identity.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'profile_open', 'chat_start', 'message', 'like', 'save')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_character_engagement_character_created
  ON creator.character_engagement_events (character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_character_engagement_actor_created
  ON creator.character_engagement_events (actor_user_id, created_at DESC);

ALTER TABLE creator.characters
  ALTER COLUMN marketplace_stats_json SET DEFAULT '{
    "views": 0,
    "profileOpens": 0,
    "chatStarts": 0,
    "messages": 0,
    "likes": 0,
    "saves": 0,
    "revenueCents": 0,
    "interactions": 0,
    "trendingScore": 0,
    "lastInteractionAt": null
  }'::jsonb;

UPDATE creator.characters
SET marketplace_stats_json = jsonb_build_object(
  'views', COALESCE((marketplace_stats_json->>'views')::INTEGER, 0),
  'profileOpens', COALESCE((marketplace_stats_json->>'profileOpens')::INTEGER, 0),
  'chatStarts', COALESCE((marketplace_stats_json->>'chatStarts')::INTEGER, (marketplace_stats_json->>'chats')::INTEGER, 0),
  'messages', COALESCE((marketplace_stats_json->>'messages')::INTEGER, 0),
  'likes', COALESCE((marketplace_stats_json->>'likes')::INTEGER, 0),
  'saves', COALESCE((marketplace_stats_json->>'saves')::INTEGER, 0),
  'revenueCents', COALESCE((marketplace_stats_json->>'revenueCents')::INTEGER, 0),
  'interactions', COALESCE(
    (marketplace_stats_json->>'interactions')::INTEGER,
    COALESCE((marketplace_stats_json->>'views')::INTEGER, 0)
      + COALESCE((marketplace_stats_json->>'profileOpens')::INTEGER, 0)
      + COALESCE((marketplace_stats_json->>'chatStarts')::INTEGER, (marketplace_stats_json->>'chats')::INTEGER, 0)
      + COALESCE((marketplace_stats_json->>'messages')::INTEGER, 0)
      + COALESCE((marketplace_stats_json->>'likes')::INTEGER, 0)
      + COALESCE((marketplace_stats_json->>'saves')::INTEGER, 0)
  ),
  'trendingScore', COALESCE((marketplace_stats_json->>'trendingScore')::DOUBLE PRECISION, 0),
  'lastInteractionAt', marketplace_stats_json->'lastInteractionAt'
);

CREATE INDEX IF NOT EXISTS idx_characters_trending_score
  ON creator.characters (((marketplace_stats_json->>'trendingScore')::DOUBLE PRECISION) DESC, published_at DESC)
  WHERE visibility = 'public' AND moderation_status = 'approved';
