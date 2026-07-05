ALTER TABLE chat.conversations
  DROP CONSTRAINT IF EXISTS conversations_response_mode_check;

ALTER TABLE chat.conversations
  ADD CONSTRAINT conversations_response_mode_check
  CHECK (response_mode IN ('mentions', 'mentions_and_handoffs'));

UPDATE chat.conversations
SET response_mode = 'mentions_and_handoffs'
WHERE conversation_type = 'group'
  AND response_mode = 'mentions';
