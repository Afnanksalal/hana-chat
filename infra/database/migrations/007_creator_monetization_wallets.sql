CREATE TABLE IF NOT EXISTS identity.user_roles (
  user_id UUID NOT NULL REFERENCES identity.users(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'support', 'moderator')),
  granted_by UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_created
  ON identity.user_roles (role, created_at DESC);

CREATE TABLE IF NOT EXISTS billing.creator_wallets (
  creator_user_id UUID PRIMARY KEY REFERENCES identity.users(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  pending_cents INTEGER NOT NULL DEFAULT 0 CHECK (pending_cents >= 0),
  available_cents INTEGER NOT NULL DEFAULT 0 CHECK (available_cents >= 0),
  lifetime_earned_cents INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned_cents >= 0),
  lifetime_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_fee_cents >= 0),
  lifetime_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_paid_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.creator_payout_profiles (
  creator_user_id UUID PRIMARY KEY REFERENCES identity.users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'verified', 'disabled')),
  display_name TEXT NOT NULL,
  legal_name TEXT,
  payout_mode TEXT NOT NULL DEFAULT 'upi' CHECK (payout_mode IN ('upi')),
  encrypted_vpa TEXT,
  vpa_last4 TEXT,
  razorpay_contact_id TEXT,
  razorpay_fund_account_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_payout_profiles_status
  ON billing.creator_payout_profiles (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing.character_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  platform_fee_cents INTEGER NOT NULL CHECK (platform_fee_cents >= 0),
  creator_net_cents INTEGER NOT NULL CHECK (creator_net_cents >= 0),
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'razorpay')),
  provider_order_id TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  idempotency_key TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_purchases_idempotency
  ON billing.character_purchases (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_purchases_provider_order
  ON billing.character_purchases (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_purchases_paid_access
  ON billing.character_purchases (user_id, character_id)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_character_purchases_creator_created
  ON billing.character_purchases (creator_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing.creator_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID REFERENCES creator.characters(id),
  source_user_id UUID REFERENCES identity.users(id),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'sale_gross',
      'platform_fee',
      'payout_reserve',
      'payout_release',
      'refund_reversal',
      'admin_adjustment'
    )
  ),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'settled', 'reversed')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_ledger_idempotency
  ON billing.creator_ledger_entries (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_creator_ledger_creator_created
  ON billing.creator_ledger_entries (creator_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_ledger_pending_release
  ON billing.creator_ledger_entries (status, available_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS billing.creator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  requested_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  approved_by_user_id UUID REFERENCES identity.users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'approved', 'processing', 'paid', 'failed', 'canceled')
  ),
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'mock', 'razorpayx')),
  provider_payout_id TEXT,
  idempotency_key TEXT NOT NULL,
  failure_reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_payouts_idempotency
  ON billing.creator_payouts (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_creator_payouts_status_requested
  ON billing.creator_payouts (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_payouts_creator_requested
  ON billing.creator_payouts (creator_user_id, requested_at DESC);

INSERT INTO billing.creator_wallets (
  creator_user_id,
  currency,
  pending_cents,
  available_cents,
  lifetime_earned_cents,
  lifetime_fee_cents,
  lifetime_paid_cents
)
SELECT users.id, 'USD', 0, 0, 0, 0, 0
FROM identity.users users
WHERE EXISTS (
  SELECT 1
  FROM creator.characters characters
  WHERE characters.creator_user_id = users.id
)
ON CONFLICT (creator_user_id) DO NOTHING;
