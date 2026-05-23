ALTER TABLE identity.phone_verifications
  ADD COLUMN IF NOT EXISTS device_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS user_agent_hash TEXT,
  ADD COLUMN IF NOT EXISTS ip_address_hash TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS provider_verification_id TEXT;

CREATE INDEX IF NOT EXISTS idx_phone_verifications_device_created
  ON identity.phone_verifications (device_id_hash, created_at DESC)
  WHERE device_id_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_verifications_ip_created
  ON identity.phone_verifications (ip_address_hash, created_at DESC)
  WHERE ip_address_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_user_role_created
  ON chat.messages (user_id, role, created_at DESC);

ALTER TABLE chat.messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;

DROP INDEX IF EXISTS idx_chat_messages_user_client_message_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_user_client_message_id
  ON chat.messages (user_id, client_message_id);

ALTER TABLE memory.facts
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_memory_facts_prompt_retrieval
  ON memory.facts (user_id, character_id, conversation_id, is_active, importance DESC, updated_at DESC)
  WHERE kind NOT IN ('safety', 'system');

CREATE INDEX IF NOT EXISTS idx_safety_decisions_conversation_created
  ON safety.decisions (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

UPDATE creator.characters
SET visibility = 'private',
    published_at = NULL,
    updated_at = now()
WHERE visibility = 'public'
  AND moderation_status <> 'approved';

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY current_period_end DESC, created_at DESC) AS rn
  FROM billing.subscriptions
  WHERE status IN ('active', 'trialing')
)
UPDATE billing.subscriptions
SET status = 'canceled',
    updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_one_active_subscription_per_user
  ON billing.subscriptions (user_id)
  WHERE status IN ('active', 'trialing');

CREATE TABLE IF NOT EXISTS billing.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_received
  ON billing.webhook_events (received_at DESC);

ALTER TABLE platform.outbox_events
  DROP CONSTRAINT IF EXISTS outbox_status_check;

ALTER TABLE platform.outbox_events
  ADD CONSTRAINT outbox_status_check
  CHECK (status IN ('pending', 'processing', 'published', 'failed', 'dead_letter'));
