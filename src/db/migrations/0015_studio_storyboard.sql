-- Storyboard mode: a reel is now 2-3 anchored scenes. Each scene carries its
-- own image + video job state inside the storyboard JSONB; identity never
-- drifts because every clip starts from an identity-locked still.

ALTER TABLE studio_reels ADD COLUMN IF NOT EXISTS storyboard JSONB;

-- New pipeline status between draft and image generation.
ALTER TABLE studio_reels DROP CONSTRAINT IF EXISTS studio_reels_status_check;
ALTER TABLE studio_reels ADD CONSTRAINT studio_reels_status_check CHECK (status IN (
  'draft',
  'storyboard_ready',
  'image_generating', 'image_ready', 'image_failed',
  'approved',
  'audio_generating',
  'video_generating', 'video_failed',
  'complete'
));
