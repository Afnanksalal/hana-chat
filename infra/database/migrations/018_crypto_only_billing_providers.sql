DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_orders_provider_check'
      AND conrelid = 'billing.payment_orders'::regclass
  ) THEN
    ALTER TABLE billing.payment_orders
      DROP CONSTRAINT payment_orders_provider_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_orders_provider_crypto_only'
      AND conrelid = 'billing.payment_orders'::regclass
  ) THEN
    ALTER TABLE billing.payment_orders
      DROP CONSTRAINT payment_orders_provider_crypto_only;
  END IF;

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

  UPDATE billing.payment_orders
  SET provider = 'stellar', updated_at = now()
  WHERE provider <> 'stellar';

  UPDATE billing.character_purchases
  SET provider = 'stellar', updated_at = now()
  WHERE provider <> 'stellar';

  UPDATE billing.creator_payouts
  SET provider = 'stellar', updated_at = now()
  WHERE provider <> 'stellar';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_orders_provider_stellar_only'
      AND conrelid = 'billing.payment_orders'::regclass
  ) THEN
    ALTER TABLE billing.payment_orders
      ADD CONSTRAINT payment_orders_provider_stellar_only
      CHECK (provider = 'stellar') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'character_purchases_provider_stellar_only'
      AND conrelid = 'billing.character_purchases'::regclass
  ) THEN
    ALTER TABLE billing.character_purchases
      ADD CONSTRAINT character_purchases_provider_stellar_only
      CHECK (provider = 'stellar') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_payouts_provider_stellar_only'
      AND conrelid = 'billing.creator_payouts'::regclass
  ) THEN
    ALTER TABLE billing.creator_payouts
      ADD CONSTRAINT creator_payouts_provider_stellar_only
      CHECK (provider = 'stellar') NOT VALID;
  END IF;
END $$;
