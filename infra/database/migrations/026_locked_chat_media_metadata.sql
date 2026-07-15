-- Migration 026: Backfill locked chat image metadata
-- Legacy locked images were embedded in messages before the media asset carried
-- its character/conversation binding. The media endpoint and unlock flow now use
-- that server-side metadata for authorization.

WITH locked_media AS (
  SELECT DISTINCT ON ((match[1])::uuid)
    (match[1])::uuid AS media_asset_id,
    messages.character_id,
    messages.conversation_id
  FROM chat.messages AS messages
  CROSS JOIN LATERAL regexp_matches(
    messages.content,
    '!\[hana-img-locked\]\(mediaId:([0-9a-fA-F-]{36})\)',
    'g'
  ) AS match
  WHERE messages.role = 'assistant'
  ORDER BY (match[1])::uuid, messages.created_at DESC
)
UPDATE creator.media_assets AS media
SET metadata_json = coalesce(media.metadata_json, '{}'::jsonb)
  || jsonb_build_object(
    'lockedChatImage', true,
    'characterId', locked_media.character_id::text,
    'conversationId', locked_media.conversation_id::text
  )
FROM locked_media
WHERE media.id = locked_media.media_asset_id
  AND media.purpose = 'nft_art';
