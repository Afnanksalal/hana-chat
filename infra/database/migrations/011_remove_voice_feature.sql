ALTER TABLE identity.user_settings
  DROP COLUMN IF EXISTS voice_enabled;

ALTER TABLE billing.plans
  DROP COLUMN IF EXISTS voice_enabled;
