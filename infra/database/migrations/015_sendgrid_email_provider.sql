ALTER TABLE identity.email_verifications
  DROP CONSTRAINT IF EXISTS email_verifications_provider_check;

ALTER TABLE identity.email_verifications
  ADD CONSTRAINT email_verifications_provider_check
  CHECK (provider IN ('local', 'smtp', 'sendgrid'));
