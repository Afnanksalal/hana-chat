DELETE FROM billing.payment_orders
WHERE provider <> 'stellar'
  AND status IN ('created', 'failed', 'expired');

DO $$
BEGIN
  UPDATE billing.creator_payout_profiles
  SET payout_mode = 'stellar', updated_at = now()
  WHERE payout_mode <> 'stellar'
    AND status IN ('pending_review', 'rejected');

  IF EXISTS (SELECT 1 FROM billing.payment_orders WHERE provider <> 'stellar') THEN
    RAISE EXCEPTION 'Cannot validate payment orders while unsupported providers remain';
  END IF;

  IF EXISTS (SELECT 1 FROM billing.character_purchases WHERE provider <> 'stellar') THEN
    RAISE EXCEPTION 'Cannot validate character purchases while unsupported providers remain';
  END IF;

  IF EXISTS (SELECT 1 FROM billing.creator_payouts WHERE provider <> 'stellar') THEN
    RAISE EXCEPTION 'Cannot validate creator payouts while unsupported providers remain';
  END IF;

  IF EXISTS (SELECT 1 FROM billing.creator_payout_profiles WHERE payout_mode <> 'stellar') THEN
    RAISE EXCEPTION 'Cannot validate payout profiles while unsupported modes remain';
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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
