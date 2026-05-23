ALTER TABLE platform.outbox_events
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT;

CREATE INDEX IF NOT EXISTS idx_outbox_events_lease
  ON platform.outbox_events (status, next_attempt_at, occurred_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_outbox_events_locked
  ON platform.outbox_events (locked_at)
  WHERE status = 'processing';
