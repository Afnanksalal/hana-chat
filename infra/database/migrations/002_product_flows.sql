CREATE TABLE IF NOT EXISTS identity.phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  encrypted_phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  risk_action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  ip_address_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS identity.user_settings (
  user_id UUID PRIMARY KEY REFERENCES identity.users(id),
  display_name TEXT,
  adult_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  adult_verified_at TIMESTAMPTZ,
  memory_enabled BOOLEAN NOT NULL DEFAULT true,
  voice_enabled BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  monthly_message_limit INTEGER NOT NULL,
  deep_memory_enabled BOOLEAN NOT NULL DEFAULT false,
  voice_enabled BOOLEAN NOT NULL DEFAULT false,
  adult_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  creator_paid_characters_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  plan_id TEXT NOT NULL REFERENCES billing.plans(id),
  provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  plan_id TEXT NOT NULL REFERENCES billing.plans(id),
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  checkout_url TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  source_user_id UUID REFERENCES identity.users(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  platform_fee_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_out_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES identity.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address_hash TEXT,
  user_agent_hash TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE creator.characters
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monetization_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_stats_json JSONB NOT NULL DEFAULT '{"chats": 0, "likes": 0, "revenueCents": 0}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_slug_unique
  ON creator.characters (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_verifications_hash_created
  ON identity.phone_verifications (phone_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON identity.sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON billing.subscriptions (user_id, status, current_period_end DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created
  ON billing.payment_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator_created
  ON billing.creator_earnings (creator_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_created
  ON platform.audit_events (actor_user_id, created_at DESC);

INSERT INTO billing.plans (
  id,
  name,
  monthly_price_cents,
  currency,
  monthly_message_limit,
  deep_memory_enabled,
  voice_enabled,
  adult_mode_enabled,
  creator_paid_characters_enabled
)
VALUES
  ('free', 'Free', 0, 'USD', 900, false, false, false, false),
  ('plus', 'Hana Plus', 999, 'USD', 6000, true, true, false, true),
  ('ultra', 'Hana Ultra', 1999, 'USD', 20000, true, true, true, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  monthly_message_limit = EXCLUDED.monthly_message_limit,
  deep_memory_enabled = EXCLUDED.deep_memory_enabled,
  voice_enabled = EXCLUDED.voice_enabled,
  adult_mode_enabled = EXCLUDED.adult_mode_enabled,
  creator_paid_characters_enabled = EXCLUDED.creator_paid_characters_enabled,
  is_active = true;
