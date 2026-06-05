-- Mode 3 "overlay": the user's own footage with Domnul Girafă composited on
-- top (transparent pose + bob animation + optional voice), ffmpeg-only.

ALTER TABLE studio_reels DROP CONSTRAINT IF EXISTS studio_reels_mode_check;
ALTER TABLE studio_reels ADD CONSTRAINT studio_reels_mode_check
  CHECK (mode IN ('scene', 'giraffe', 'overlay'));
