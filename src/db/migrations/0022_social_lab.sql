-- ============================================
-- Social Lab — Zernio-backed social media service (grappes.dev/social)
-- ============================================
-- Ported from Korbee's social stack, Zernio-only. Zernio (zernio.com) holds
-- the platform OAuth tokens via its own pre-approved Meta/TikTok apps; we
-- store a per-user profileId (plain Mongo _id, not a secret) and ingest
-- accounts + analytics into the shared social_* tables below.

CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'tiktok');

CREATE TYPE social_draft_status AS ENUM ('idea', 'saved', 'copied', 'dismissed');

-- One Zernio profile per grappes user, created lazily on first connect.
CREATE TABLE IF NOT EXISTS social_zernio_profiles (
  user_id           UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  profile_id        TEXT NOT NULL,
  accounts_snapshot JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at      TIMESTAMPTZ,
  last_sync_error   TEXT
);

CREATE INDEX IF NOT EXISTS social_zernio_profiles_synced_idx
  ON social_zernio_profiles (last_sync_at);

-- One row per (user, platform).
CREATE TABLE IF NOT EXISTS social_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  platform         social_platform NOT NULL,
  external_user_id TEXT,
  username         TEXT,
  display_name     TEXT,
  avatar_url       TEXT,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at     TIMESTAMPTZ,
  last_sync_error  TEXT,
  disconnected_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS social_connections_user_platform_idx
  ON social_connections (user_id, platform);
CREATE INDEX IF NOT EXISTS social_connections_external_idx
  ON social_connections (platform, external_user_id);

-- One row per (connection, day) — trendlines + audit inputs.
CREATE TABLE IF NOT EXISTS social_metrics_daily (
  connection_id           UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  day                     DATE NOT NULL,
  followers               INTEGER,
  following               INTEGER,
  posts_count             INTEGER,
  engagement_rate_30d_bp  INTEGER,
  reach_28d               INTEGER,
  impressions_28d         INTEGER,
  profile_views_28d       INTEGER,
  demographics            JSONB,
  captured_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_metrics_daily_pk
  ON social_metrics_daily (connection_id, day);

-- Recent posts + per-post engagement. ai_image_description is generated once
-- (Claude multimodal) and cached forever.
CREATE TABLE IF NOT EXISTS social_posts_cache (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  external_post_id     TEXT NOT NULL,
  posted_at            TIMESTAMPTZ NOT NULL,
  media_type           TEXT,
  media_url            TEXT,
  permalink            TEXT,
  caption              TEXT,
  ai_image_description TEXT,
  likes                INTEGER,
  comments             INTEGER,
  shares               INTEGER,
  saves                INTEGER,
  views                INTEGER,
  reach                INTEGER,
  impressions          INTEGER,
  engagement_rate_bp   INTEGER,
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_posts_cache_pk
  ON social_posts_cache (connection_id, external_post_id);
CREATE INDEX IF NOT EXISTS social_posts_cache_posted_idx
  ON social_posts_cache (connection_id, posted_at);

-- Claude-generated insights, cached by inputs hash (7d TTL enforced in code).
CREATE TABLE IF NOT EXISTS social_audits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  inputs_hash   TEXT NOT NULL,
  insights      JSONB NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  pinned_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS social_audits_user_generated_idx
  ON social_audits (user_id, generated_at);
CREATE UNIQUE INDEX IF NOT EXISTS social_audits_user_hash_idx
  ON social_audits (user_id, inputs_hash);

-- AI-generated post ideas / staged captions.
CREATE TABLE IF NOT EXISTS social_post_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  platforms       social_platform[] NOT NULL,
  concept         TEXT NOT NULL,
  caption_draft   TEXT NOT NULL,
  hashtag_options JSONB NOT NULL,
  suggested_time  TIMESTAMPTZ,
  reasoning       TEXT,
  status          social_draft_status NOT NULL DEFAULT 'idea',
  model           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS social_post_drafts_user_created_idx
  ON social_post_drafts (user_id, created_at);
CREATE INDEX IF NOT EXISTS social_post_drafts_status_idx
  ON social_post_drafts (user_id, status);
-- ============================================
-- Social Lab Phase 2 — autopost queue ("post from a folder")
-- ============================================
-- The user drops media into a Blob folder (social/{userId}/queue/); the
-- hourly cron drains it: AI describes the media, writes a caption in the
-- brand voice, and schedules the post via Zernio at the next slot inside
-- the user's posting window.

CREATE TYPE social_queue_status AS ENUM ('queued', 'scheduled', 'posted', 'failed');

-- Autopost config, one per user.
CREATE TABLE IF NOT EXISTS social_queues (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  active            BOOLEAN NOT NULL DEFAULT true,
  platforms         social_platform[] NOT NULL,
  cadence_hours     INTEGER NOT NULL DEFAULT 24,
  window_start_hour INTEGER NOT NULL DEFAULT 18,
  window_end_hour   INTEGER NOT NULL DEFAULT 21,
  timezone          TEXT NOT NULL DEFAULT 'Europe/Bucharest',
  brand_voice       TEXT,
  hashtags          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_queues_user_idx
  ON social_queues (user_id);

-- One media file dropped into the queue.
CREATE TABLE IF NOT EXISTS social_queue_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id        UUID NOT NULL REFERENCES social_queues(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  blob_url        TEXT NOT NULL,
  blob_pathname   TEXT,
  file_name       TEXT,
  media_type      TEXT NOT NULL,
  ai_description  TEXT,
  caption         TEXT,
  scheduled_for   TIMESTAMPTZ,
  zernio_post_id  TEXT,
  status          social_queue_status NOT NULL DEFAULT 'queued',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_queue_items_queue_status_idx
  ON social_queue_items (queue_id, status, created_at);
CREATE INDEX IF NOT EXISTS social_queue_items_user_idx
  ON social_queue_items (user_id, created_at);
