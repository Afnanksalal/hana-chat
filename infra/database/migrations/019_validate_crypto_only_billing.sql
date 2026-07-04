DELETE FROM billing.payment_orders
WHERE provider <> 'crypto'
  AND status IN ('created', 'failed', 'expired');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM billing.payment_orders WHERE provider <> 'crypto') THEN
    RAISE EXCEPTION 'Cannot validate crypto-only payment orders while non-crypto paid orders remain';
  END IF;

  IF EXISTS (SELECT 1 FROM billing.character_purchases WHERE provider <> 'crypto') THEN
    RAISE EXCEPTION 'Cannot validate crypto-only character purchases while non-crypto rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM billing.creator_payouts WHERE provider <> 'crypto') THEN
    RAISE EXCEPTION 'Cannot validate crypto-only creator payouts while non-crypto rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM billing.creator_payout_profiles WHERE payout_mode <> 'crypto') THEN
    RAISE EXCEPTION 'Cannot validate crypto-only payout profiles while non-crypto rows remain';
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payout_profiles_payout_mode_crypto_only'
      AND conrelid = 'billing.creator_payout_profiles'::regclass
  ) THEN
    ALTER TABLE billing.creator_payout_profiles
      ADD CONSTRAINT creator_payout_profiles_payout_mode_crypto_only
      CHECK (payout_mode = 'crypto') NOT VALID;
  END IF;
END $$;

ALTER TABLE billing.payment_orders VALIDATE CONSTRAINT payment_orders_provider_crypto_only;
ALTER TABLE billing.character_purchases VALIDATE CONSTRAINT character_purchases_provider_crypto_only;
ALTER TABLE billing.creator_payouts VALIDATE CONSTRAINT creator_payouts_provider_crypto_only;
ALTER TABLE billing.creator_payout_profiles VALIDATE CONSTRAINT creator_payout_profiles_payout_mode_crypto_only;
