-- Migration 025: Chat image unlock tracking
-- Tracks which users have paid to unlock and collect AI-generated chat images.
-- Runtime pricing and creator/platform split are written by the API.

CREATE TABLE IF NOT EXISTS chat.image_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id UUID NOT NULL REFERENCES creator.media_assets(id),
  buyer_user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  payment_id UUID NOT NULL REFERENCES billing.crypto_payments(id),
  nft_asset_id UUID REFERENCES web3.nft_assets(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'minted', 'failed')),
  amount_xlm NUMERIC(18, 7) NOT NULL DEFAULT 5.0000000,
  creator_share_xlm NUMERIC(18, 7) NOT NULL DEFAULT 3.5000000,
  platform_share_xlm NUMERIC(18, 7) NOT NULL DEFAULT 1.5000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_image_unlocks_buyer_media
  ON chat.image_unlocks (buyer_user_id, media_asset_id);

CREATE INDEX IF NOT EXISTS idx_chat_image_unlocks_media
  ON chat.image_unlocks (media_asset_id);

CREATE INDEX IF NOT EXISTS idx_chat_image_unlocks_payment
  ON chat.image_unlocks (payment_id);
