INSERT INTO billing.plans (
  id,
  name,
  monthly_price_cents,
  currency,
  monthly_message_limit,
  deep_memory_enabled,
  adult_mode_enabled,
  creator_paid_characters_enabled
)
VALUES
  ('plus', 'Hana Plus', 999, 'USD', 6000, true, false, true),
  ('ultra', 'Hana Ultra', 1999, 'USD', 20000, true, true, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  monthly_message_limit = EXCLUDED.monthly_message_limit,
  deep_memory_enabled = EXCLUDED.deep_memory_enabled,
  adult_mode_enabled = EXCLUDED.adult_mode_enabled,
  creator_paid_characters_enabled = EXCLUDED.creator_paid_characters_enabled,
  is_active = true;
