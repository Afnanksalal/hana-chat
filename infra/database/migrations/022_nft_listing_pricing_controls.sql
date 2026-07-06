ALTER TABLE web3.nft_listings
  ADD COLUMN IF NOT EXISTS min_offer_cents INTEGER;

UPDATE web3.nft_listings
SET min_offer_cents = price_cents
WHERE min_offer_cents IS NULL;

ALTER TABLE web3.nft_listings
  ALTER COLUMN min_offer_cents SET NOT NULL,
  ALTER COLUMN min_offer_cents SET DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nft_listings_min_offer_price_check'
  ) THEN
    ALTER TABLE web3.nft_listings
      ADD CONSTRAINT nft_listings_min_offer_price_check
      CHECK (min_offer_cents > 0 AND min_offer_cents <= price_cents);
  END IF;
END $$;
