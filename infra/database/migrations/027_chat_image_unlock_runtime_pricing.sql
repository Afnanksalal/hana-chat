-- Migration 027: Require API-priced chat image unlock rows
-- Historical defaults encoded the launch price in schema. Runtime pricing now
-- comes from configuration and every insert must persist the calculated split.

ALTER TABLE chat.image_unlocks
  ALTER COLUMN amount_xlm DROP DEFAULT,
  ALTER COLUMN creator_share_xlm DROP DEFAULT,
  ALTER COLUMN platform_share_xlm DROP DEFAULT;
