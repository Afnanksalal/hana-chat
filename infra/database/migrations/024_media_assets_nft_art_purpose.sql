-- Migration 024: Add nft_art to media_assets purpose CHECK constraint
-- The original constraint (006) only allowed character_avatar, character_cover, user_avatar.
-- NFT collectible art generation (added in 021) inserts purpose='nft_art' which violated
-- the constraint, causing a 500 error on POST /api/v1/media/generate.

ALTER TABLE creator.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_purpose_check;

ALTER TABLE creator.media_assets
  ADD CONSTRAINT media_assets_purpose_check
  CHECK (purpose IN ('character_avatar', 'character_cover', 'user_avatar', 'nft_art'));
