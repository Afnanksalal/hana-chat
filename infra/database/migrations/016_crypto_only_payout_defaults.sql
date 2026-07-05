UPDATE billing.creator_payouts
SET
  provider = 'stellar',
  provider_payout_id = NULL,
  status = CASE
    WHEN status = 'processing' THEN 'approved'
    ELSE status
  END,
  metadata_json = coalesce(metadata_json, '{}'::jsonb)
    || jsonb_build_object(
      'providerMigratedFrom', provider,
      'providerPayoutIdMigratedFrom', provider_payout_id,
      'providerMigratedAt', now()
    ),
  updated_at = now()
WHERE provider <> 'stellar'
  AND status IN ('requested', 'approved', 'processing');

ALTER TABLE billing.creator_payouts
  ALTER COLUMN provider SET DEFAULT 'stellar';
