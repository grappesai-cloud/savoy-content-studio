-- Custom characters for the client dashboard: any mascot, not just Domnul Girafă.
-- The client uploads a master image + name; Claude writes the identity-lock block
-- that rides along with every image prompt (same guarantee as the giraffe's).
-- NULL character_id on a reel = the built-in Domnul Girafă.

CREATE TABLE IF NOT EXISTS studio_characters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  master_image_url  TEXT NOT NULL,          -- Vercel Blob URL (must be provider-fetchable)
  identity_lock     TEXT NOT NULL,          -- "LOCKED visual asset" block, auto-written by Claude
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_characters_user ON studio_characters(user_id, created_at DESC);

ALTER TABLE studio_reels ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES studio_characters(id) ON DELETE SET NULL;

-- The client's explicit OK on the generated script, before any image is made.
ALTER TABLE studio_reels ADD COLUMN IF NOT EXISTS text_approved_at TIMESTAMPTZ;
