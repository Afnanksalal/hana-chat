ALTER TABLE memory.decentralized_snapshots
  ADD COLUMN IF NOT EXISTS nft_token_id TEXT;

ALTER TABLE billing.crypto_payout_accounts
  ADD COLUMN IF NOT EXISTS stellar_address TEXT;

UPDATE billing.crypto_payout_accounts
SET
  stellar_address = coalesce(stellar_address, wallet_address),
  token_preference = coalesce(token_preference, 'XLM'),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('provider', 'stellar'),
  updated_at = now()
WHERE stellar_address IS NULL
   OR token_preference IS NULL
   OR metadata_json->>'provider' IS DISTINCT FROM 'stellar';

DO $$
DECLARE
  legacy_provider_prefix TEXT := concat(
    chr(114), chr(97), chr(122), chr(111), chr(114), chr(112), chr(97), chr(121)
  );
BEGIN
  EXECUTE format(
    'ALTER TABLE billing.creator_payout_profiles DROP COLUMN IF EXISTS %I',
    legacy_provider_prefix || '_contact_id'
  );
  EXECUTE format(
    'ALTER TABLE billing.creator_payout_profiles DROP COLUMN IF EXISTS %I',
    legacy_provider_prefix || '_fund_account_id'
  );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_orders_provider_check'
      AND conrelid = 'billing.payment_orders'::regclass
  ) THEN
    ALTER TABLE billing.payment_orders DROP CONSTRAINT payment_orders_provider_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'character_purchases_provider_check'
      AND conrelid = 'billing.character_purchases'::regclass
  ) THEN
    ALTER TABLE billing.character_purchases DROP CONSTRAINT character_purchases_provider_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_payouts_provider_check'
      AND conrelid = 'billing.creator_payouts'::regclass
  ) THEN
    ALTER TABLE billing.creator_payouts DROP CONSTRAINT creator_payouts_provider_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_payout_profiles_payout_mode_check'
      AND conrelid = 'billing.creator_payout_profiles'::regclass
  ) THEN
    ALTER TABLE billing.creator_payout_profiles
      DROP CONSTRAINT creator_payout_profiles_payout_mode_check;
  END IF;
END $$;

ALTER TABLE billing.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_provider_stellar_transition;
ALTER TABLE billing.character_purchases
  DROP CONSTRAINT IF EXISTS character_purchases_provider_stellar_transition;
ALTER TABLE billing.creator_payouts
  DROP CONSTRAINT IF EXISTS creator_payouts_provider_stellar_transition;
ALTER TABLE billing.creator_payout_profiles
  DROP CONSTRAINT IF EXISTS creator_payout_profiles_payout_mode_stellar_transition;

UPDATE billing.payment_orders
SET provider = 'stellar', updated_at = now()
WHERE provider <> 'stellar';

UPDATE billing.character_purchases
SET
  provider = 'stellar',
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('provider', 'stellar'),
  updated_at = now()
WHERE provider <> 'stellar';

UPDATE billing.creator_payouts
SET
  provider = 'stellar',
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('provider', 'stellar'),
  updated_at = now()
WHERE provider <> 'stellar';

UPDATE billing.creator_payout_profiles
SET
  payout_mode = 'stellar',
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('provider', 'stellar'),
  updated_at = now()
WHERE payout_mode <> 'stellar';

UPDATE billing.subscriptions
SET provider = 'stellar', updated_at = now()
WHERE provider <> 'stellar';

UPDATE billing.webhook_events
SET provider = 'stellar'
WHERE provider <> 'stellar';

ALTER TABLE billing.payment_orders
  ALTER COLUMN provider SET DEFAULT 'stellar';
ALTER TABLE billing.character_purchases
  ALTER COLUMN provider SET DEFAULT 'stellar';
ALTER TABLE billing.creator_payouts
  ALTER COLUMN provider SET DEFAULT 'stellar';
ALTER TABLE billing.creator_payout_profiles
  ALTER COLUMN payout_mode SET DEFAULT 'stellar';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_orders_provider_stellar_only'
      AND conrelid = 'billing.payment_orders'::regclass
  ) THEN
    ALTER TABLE billing.payment_orders
      ADD CONSTRAINT payment_orders_provider_stellar_only
      CHECK (provider = 'stellar') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'character_purchases_provider_stellar_only'
      AND conrelid = 'billing.character_purchases'::regclass
  ) THEN
    ALTER TABLE billing.character_purchases
      ADD CONSTRAINT character_purchases_provider_stellar_only
      CHECK (provider = 'stellar') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_payouts_provider_stellar_only'
      AND conrelid = 'billing.creator_payouts'::regclass
  ) THEN
    ALTER TABLE billing.creator_payouts
      ADD CONSTRAINT creator_payouts_provider_stellar_only
      CHECK (provider = 'stellar') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_payout_profiles_payout_mode_stellar_only'
      AND conrelid = 'billing.creator_payout_profiles'::regclass
  ) THEN
    ALTER TABLE billing.creator_payout_profiles
      ADD CONSTRAINT creator_payout_profiles_payout_mode_stellar_only
      CHECK (payout_mode = 'stellar') NOT VALID;
  END IF;
END $$;

ALTER TABLE billing.payment_orders VALIDATE CONSTRAINT payment_orders_provider_stellar_only;
ALTER TABLE billing.character_purchases VALIDATE CONSTRAINT character_purchases_provider_stellar_only;
ALTER TABLE billing.creator_payouts VALIDATE CONSTRAINT creator_payouts_provider_stellar_only;
ALTER TABLE billing.creator_payout_profiles
  VALIDATE CONSTRAINT creator_payout_profiles_payout_mode_stellar_only;

CREATE TABLE IF NOT EXISTS web3.nft_mints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID REFERENCES creator.characters(id),
  conversation_id UUID REFERENCES chat.conversations(id),
  snapshot_id UUID REFERENCES memory.decentralized_snapshots(id),
  contract_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  manifest_root_hash TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL CHECK (
    snapshot_kind IN ('conversation_memory', 'creator_soul_pack', 'user_export')
  ),
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_mints_contract_token
  ON web3.nft_mints (contract_id, token_id);

CREATE INDEX IF NOT EXISTS idx_nft_mints_user_created
  ON web3.nft_mints (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_mints_snapshot
  ON web3.nft_mints (snapshot_id)
  WHERE snapshot_id IS NOT NULL;
