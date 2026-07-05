DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'character_purchases_provider_check'
      AND conrelid = 'billing.character_purchases'::regclass
  ) THEN
    ALTER TABLE billing.character_purchases
      DROP CONSTRAINT character_purchases_provider_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'character_purchases_provider_crypto_only'
      AND conrelid = 'billing.character_purchases'::regclass
  ) THEN
    ALTER TABLE billing.character_purchases
      DROP CONSTRAINT character_purchases_provider_crypto_only;
  END IF;

  UPDATE billing.character_purchases
  SET provider = 'stellar', updated_at = now()
  WHERE provider <> 'stellar';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'character_purchases_provider_check'
      AND conrelid = 'billing.character_purchases'::regclass
  ) THEN
    ALTER TABLE billing.character_purchases
      ADD CONSTRAINT character_purchases_provider_check
      CHECK (provider = 'stellar');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payouts_provider_check'
      AND conrelid = 'billing.creator_payouts'::regclass
  ) THEN
    ALTER TABLE billing.creator_payouts
      DROP CONSTRAINT creator_payouts_provider_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payouts_provider_crypto_only'
      AND conrelid = 'billing.creator_payouts'::regclass
  ) THEN
    ALTER TABLE billing.creator_payouts
      DROP CONSTRAINT creator_payouts_provider_crypto_only;
  END IF;

  UPDATE billing.creator_payouts
  SET provider = 'stellar', updated_at = now()
  WHERE provider <> 'stellar';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payouts_provider_check'
      AND conrelid = 'billing.creator_payouts'::regclass
  ) THEN
    ALTER TABLE billing.creator_payouts
      ADD CONSTRAINT creator_payouts_provider_check
      CHECK (provider = 'stellar');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payout_profiles_payout_mode_check'
      AND conrelid = 'billing.creator_payout_profiles'::regclass
  ) THEN
    ALTER TABLE billing.creator_payout_profiles
      DROP CONSTRAINT creator_payout_profiles_payout_mode_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payout_profiles_payout_mode_crypto_only'
      AND conrelid = 'billing.creator_payout_profiles'::regclass
  ) THEN
    ALTER TABLE billing.creator_payout_profiles
      DROP CONSTRAINT creator_payout_profiles_payout_mode_crypto_only;
  END IF;

  UPDATE billing.creator_payout_profiles
  SET
    payout_mode = 'stellar',
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('provider', 'stellar'),
    updated_at = now()
  WHERE payout_mode <> 'stellar'
     OR metadata_json->>'provider' IS DISTINCT FROM 'stellar';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payout_profiles_payout_mode_check'
      AND conrelid = 'billing.creator_payout_profiles'::regclass
  ) THEN
    ALTER TABLE billing.creator_payout_profiles
      ADD CONSTRAINT creator_payout_profiles_payout_mode_check
      CHECK (payout_mode = 'stellar');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crypto_payments_status_expires
  ON billing.crypto_payments (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_crypto_payments_purpose
  ON billing.crypto_payments (purpose, created_at DESC);
