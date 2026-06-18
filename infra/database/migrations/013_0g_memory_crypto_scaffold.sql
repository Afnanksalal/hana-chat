CREATE SCHEMA IF NOT EXISTS web3;

CREATE TABLE IF NOT EXISTS memory.decentralized_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID REFERENCES creator.characters(id),
  conversation_id UUID REFERENCES chat.conversations(id),
  snapshot_kind TEXT NOT NULL CHECK (
    snapshot_kind IN ('conversation_memory', 'creator_soul_pack', 'user_export')
  ),
  storage_network TEXT NOT NULL,
  root_hash TEXT NOT NULL,
  tx_hash TEXT,
  manifest_hash TEXT NOT NULL,
  encryption_mode TEXT NOT NULL,
  encryption_key_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending_upload', 'uploaded', 'confirmed', 'failed', 'disabled', 'unrecoverable')
  ),
  source_memory_ids UUID[] NOT NULL DEFAULT '{}',
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decentralized_snapshots_idempotency
  ON memory.decentralized_snapshots (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_decentralized_snapshots_user_conversation
  ON memory.decentralized_snapshots (user_id, character_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decentralized_snapshots_status
  ON memory.decentralized_snapshots (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing.crypto_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id UUID NOT NULL REFERENCES identity.users(id),
  purpose TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_address TEXT,
  amount_atomic NUMERIC NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL,
  wallet_address TEXT,
  provider_reference TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'pending', 'finalizing', 'finalized', 'failed', 'expired', 'refunded')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  finalized_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_payments_provider_reference
  ON billing.crypto_payments (provider_reference);

CREATE INDEX IF NOT EXISTS idx_crypto_payments_buyer_created
  ON billing.crypto_payments (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crypto_payments_tx_hash
  ON billing.crypto_payments (chain_id, tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing.crypto_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  chain_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  token_preference TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('draft', 'pending_review', 'verified', 'disabled')
  ),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_payout_accounts_creator_chain
  ON billing.crypto_payout_accounts (creator_user_id, chain_id);

CREATE INDEX IF NOT EXISTS idx_crypto_payout_accounts_status
  ON billing.crypto_payout_accounts (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS web3.chain_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  provider_reference TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'detected' CHECK (
    status IN ('detected', 'confirming', 'confirmed', 'reorged', 'failed')
  ),
  block_number NUMERIC,
  confirmation_count INTEGER NOT NULL DEFAULT 0,
  raw_payload_hash TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_transactions_chain_hash
  ON web3.chain_transactions (chain_id, tx_hash);

CREATE INDEX IF NOT EXISTS idx_chain_transactions_status
  ON web3.chain_transactions (status, updated_at DESC);
