-- Multiple reference images per custom character. The master image stays the
-- canonical anchor source; the extra references feed the identity-lock block
-- (Claude sees all of them) so the lock captures the character from more angles.
ALTER TABLE studio_characters
  ADD COLUMN IF NOT EXISTS reference_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
