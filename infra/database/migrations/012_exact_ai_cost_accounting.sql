ALTER TABLE analytics.model_calls
  ADD COLUMN IF NOT EXISTS cost_in_usd_ticks BIGINT;

ALTER TABLE analytics.model_calls
  ALTER COLUMN estimated_cost_usd TYPE NUMERIC(18, 10);
