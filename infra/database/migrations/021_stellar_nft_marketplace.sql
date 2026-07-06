CREATE TABLE IF NOT EXISTS web3.nft_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  owner_user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  media_asset_id UUID NOT NULL REFERENCES creator.media_assets(id),
  contract_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  network TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  royalty_bps INTEGER NOT NULL DEFAULT 500 CHECK (royalty_bps BETWEEN 0 AND 1000),
  creator_address TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  mint_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'minting' CHECK (
    status IN ('minting', 'minted', 'listed', 'sold', 'delisted', 'failed')
  ),
  moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (
    moderation_status IN ('approved', 'pending_review', 'rejected')
  ),
  failure_reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  minted_at TIMESTAMPTZ,
  listed_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_assets_contract_token
  ON web3.nft_assets (contract_id, token_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_assets_media
  ON web3.nft_assets (media_asset_id);

CREATE INDEX IF NOT EXISTS idx_nft_assets_marketplace
  ON web3.nft_assets (moderation_status, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_assets_owner_created
  ON web3.nft_assets (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_assets_creator_created
  ON web3.nft_assets (creator_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS web3.nft_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_asset_id UUID NOT NULL REFERENCES web3.nft_assets(id),
  seller_user_id UUID NOT NULL REFERENCES identity.users(id),
  seller_address TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  asset_code TEXT NOT NULL DEFAULT 'XLM',
  asset_issuer TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'reserved', 'sold', 'cancelled', 'expired')
  ),
  reserved_by_user_id UUID REFERENCES identity.users(id),
  reserved_sale_id UUID,
  reserved_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_listings_one_open
  ON web3.nft_listings (nft_asset_id)
  WHERE status IN ('active', 'reserved');

CREATE INDEX IF NOT EXISTS idx_nft_listings_marketplace
  ON web3.nft_listings (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_listings_reservation
  ON web3.nft_listings (status, reserved_until)
  WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS web3.nft_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_asset_id UUID NOT NULL REFERENCES web3.nft_assets(id),
  buyer_user_id UUID NOT NULL REFERENCES identity.users(id),
  buyer_address TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  asset_code TEXT NOT NULL DEFAULT 'XLM',
  asset_issuer TEXT,
  provider_payment_id UUID REFERENCES billing.crypto_payments(id),
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'funded', 'accepted', 'declined', 'expired', 'failed')
  ),
  expires_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  funded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nft_offers_asset_status
  ON web3.nft_offers (nft_asset_id, status, amount_cents DESC);

CREATE INDEX IF NOT EXISTS idx_nft_offers_buyer_created
  ON web3.nft_offers (buyer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS web3.nft_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_asset_id UUID NOT NULL REFERENCES web3.nft_assets(id),
  listing_id UUID REFERENCES web3.nft_listings(id),
  offer_id UUID REFERENCES web3.nft_offers(id),
  seller_user_id UUID NOT NULL REFERENCES identity.users(id),
  buyer_user_id UUID NOT NULL REFERENCES identity.users(id),
  seller_address TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  platform_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  royalty_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (royalty_fee_cents >= 0),
  seller_net_cents INTEGER NOT NULL CHECK (seller_net_cents >= 0),
  provider_payment_id UUID REFERENCES billing.crypto_payments(id),
  payment_tx_hash TEXT,
  transfer_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (
    status IN ('pending_payment', 'paid', 'transferring', 'transferred', 'failed')
  ),
  failure_reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  transferred_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nft_sales_asset_created
  ON web3.nft_sales (nft_asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_sales_buyer_created
  ON web3.nft_sales (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_sales_seller_created
  ON web3.nft_sales (seller_user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_nft_listings_reserved_sale'
  ) THEN
    ALTER TABLE web3.nft_listings
      ADD CONSTRAINT fk_nft_listings_reserved_sale
      FOREIGN KEY (reserved_sale_id) REFERENCES web3.nft_sales(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS web3.nft_ownership_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_asset_id UUID NOT NULL REFERENCES web3.nft_assets(id),
  from_user_id UUID REFERENCES identity.users(id),
  to_user_id UUID NOT NULL REFERENCES identity.users(id),
  from_address TEXT,
  to_address TEXT NOT NULL,
  tx_hash TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('mint', 'sale_transfer', 'offer_transfer')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nft_ownership_events_asset_created
  ON web3.nft_ownership_events (nft_asset_id, created_at DESC);
