ALTER TABLE identity.risk_sessions
  ADD COLUMN IF NOT EXISTS email_hash TEXT;

CREATE TABLE IF NOT EXISTS identity.email_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  email_hash TEXT NOT NULL UNIQUE,
  encrypted_email TEXT NOT NULL,
  email_domain TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_primary BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS identity.email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL,
  encrypted_email TEXT NOT NULL,
  email_domain TEXT NOT NULL,
  username TEXT,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'signin')),
  risk_action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_id_hash TEXT,
  user_agent_hash TEXT,
  ip_address_hash TEXT,
  provider TEXT NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'smtp')),
  provider_message_id TEXT
);

CREATE TABLE IF NOT EXISTS identity.account_ip_claims (
  ip_address_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.account_device_claims (
  device_id_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_credentials_user
  ON identity.email_credentials (user_id);

CREATE INDEX IF NOT EXISTS idx_email_credentials_domain
  ON identity.email_credentials (email_domain, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verifications_hash_created
  ON identity.email_verifications (email_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verifications_device_created
  ON identity.email_verifications (device_id_hash, created_at DESC)
  WHERE device_id_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_verifications_ip_created
  ON identity.email_verifications (ip_address_hash, created_at DESC)
  WHERE ip_address_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_ip_claims_user
  ON identity.account_ip_claims (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_device_claims_user
  ON identity.account_device_claims (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_sessions_email_created
  ON identity.risk_sessions (email_hash, created_at DESC)
  WHERE email_hash IS NOT NULL;
