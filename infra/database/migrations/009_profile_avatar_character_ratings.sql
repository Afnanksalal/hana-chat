ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS creator.character_ratings (
  character_id UUID NOT NULL REFERENCES creator.characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_character_ratings_character_updated
  ON creator.character_ratings (character_id, updated_at DESC);

ALTER TABLE creator.characters
  ALTER COLUMN marketplace_stats_json SET DEFAULT '{
    "views": 0,
    "profileOpens": 0,
    "chatStarts": 0,
    "messages": 0,
    "likes": 0,
    "saves": 0,
    "revenueCents": 0,
    "ratingAverage": 0,
    "ratingCount": 0,
    "interactions": 0,
    "trendingScore": 0,
    "lastInteractionAt": null
  }'::jsonb;

UPDATE creator.characters
SET marketplace_stats_json = marketplace_stats_json
  || jsonb_build_object(
    'ratingAverage',
    COALESCE((marketplace_stats_json->>'ratingAverage')::DOUBLE PRECISION, 0),
    'ratingCount',
    COALESCE((marketplace_stats_json->>'ratingCount')::INTEGER, 0)
  );
