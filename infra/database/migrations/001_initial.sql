CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS memory;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS creator;
CREATE SCHEMA IF NOT EXISTS safety;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS identity.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS identity.phone_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  phone_hash TEXT NOT NULL UNIQUE,
  encrypted_phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL,
  line_type TEXT NOT NULL,
  carrier_name TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_primary BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS identity.risk_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES identity.users(id),
  phone_hash TEXT,
  device_id TEXT,
  ip_address_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  action_taken TEXT NOT NULL,
  signals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES identity.users(id),
  device_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, device_id)
);

CREATE TABLE IF NOT EXISTS creator.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  current_version_id UUID,
  visibility TEXT NOT NULL DEFAULT 'private',
  moderation_status TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS creator.character_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  persona_prompt TEXT NOT NULL,
  greeting TEXT NOT NULL,
  example_dialogues_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (character_id, version)
);

CREATE TABLE IF NOT EXISTS chat.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS chat.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat.conversations(id),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID NOT NULL REFERENCES creator.characters(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS memory.facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  character_id UUID REFERENCES creator.characters(id),
  conversation_id UUID REFERENCES chat.conversations(id),
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  importance DOUBLE PRECISION NOT NULL,
  emotional_weight DOUBLE PRECISION NOT NULL,
  source_message_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES memory.facts(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS safety.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES identity.users(id),
  conversation_id UUID REFERENCES chat.conversations(id),
  message_id UUID REFERENCES chat.messages(id),
  stage TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  action TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  confidence DOUBLE PRECISION NOT NULL,
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics.model_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES identity.users(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_version TEXT,
  safety_policy_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.credit_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS platform.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  event_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_phone_credentials_user
  ON identity.phone_credentials (user_id);

CREATE INDEX IF NOT EXISTS idx_risk_sessions_user_created
  ON identity.risk_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_sessions_phone_created
  ON identity.risk_sessions (phone_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user
  ON identity.device_fingerprints (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_characters_visibility_status
  ON creator.characters (visibility, moderation_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON chat.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON chat.messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_facts_user_character_active
  ON memory.facts (user_id, character_id, is_active, importance DESC);

CREATE INDEX IF NOT EXISTS idx_memory_facts_scope
  ON memory.facts (scope, kind, is_active);

CREATE INDEX IF NOT EXISTS idx_safety_decisions_user_created
  ON safety.decisions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_calls_user_created
  ON analytics.model_calls (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_calls_provider_model_created
  ON analytics.model_calls (provider, model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON platform.outbox_events (status, next_attempt_at, occurred_at);
