-- Assembly lock: only ONE poll invocation may run the final ffmpeg cut.
-- Concurrent polls each kicked off their own assembly (Fluid reuses the
-- instance → N parallel ffmpeg runs + N×35MB buffers → memory thrash →
-- 800s runtime timeouts, verified in prod logs). The claimant flips the
-- reel to 'assembling' atomically; everyone else skips and keeps polling.

ALTER TABLE studio_reels DROP CONSTRAINT IF EXISTS studio_reels_status_check;
ALTER TABLE studio_reels ADD CONSTRAINT studio_reels_status_check CHECK (
  status = ANY (ARRAY[
    'draft', 'storyboard_ready',
    'image_generating', 'image_ready', 'image_failed',
    'approved', 'audio_generating',
    'video_generating', 'assembling', 'video_failed',
    'complete'
  ])
);
