UPDATE billing.creator_payouts
SET
  provider = 'crypto',
  provider_payout_id = CASE
    WHEN provider_payout_id ~ '^0x[a-fA-F0-9]{64}$' THEN provider_payout_id
    ELSE NULL
  END,
  status = CASE
    WHEN status = 'processing'
      AND (provider_payout_id IS NULL OR provider_payout_id !~ '^0x[a-fA-F0-9]{64}$')
    THEN 'approved'
    ELSE status
  END,
  metadata_json = coalesce(metadata_json, '{}'::jsonb)
    || jsonb_build_object(
      'providerMigratedFrom', provider,
      'providerPayoutIdMigratedFrom', provider_payout_id,
      'providerMigratedAt', now()
    ),
  updated_at = now()
WHERE provider IN ('manual', 'mock', 'razorpayx')
  AND status IN ('requested', 'approved', 'processing');

ALTER TABLE billing.creator_payouts
  ALTER COLUMN provider SET DEFAULT 'crypto';
