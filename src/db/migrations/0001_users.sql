-- Minimal user profile table (mirrored from Better-Auth on signup).
-- Studio tables reference users(id).

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
