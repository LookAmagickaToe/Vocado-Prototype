-- Index of generated read-aloud audio for news articles.
--
-- The audio itself lives in the worlds storage bucket under `_tts/<hash>.mp3`,
-- with its timing table alongside at `_tts/<hash>.json`. The hash is derived
-- from the model, voice, output format and the exact text, so the same article
-- in the same voice is generated once and then shared by every user who plays
-- it — this table exists to make that spend visible and to mark which blobs
-- must never be pruned.

CREATE TABLE IF NOT EXISTS tts_cache (
  hash TEXT PRIMARY KEY,           -- sha256(model|voice|format|text), also the storage path stem
  language TEXT NOT NULL,          -- language label the text was in
  variant TEXT,                    -- regional variety slug, when one was set
  voice_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  char_count INTEGER NOT NULL,     -- billed characters, for cost reporting
  duration_sec REAL,
  -- Set when a user saves the article. Pinned rows are permanent: the saved
  -- world references this hash and expects it to keep resolving forever.
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost reporting: "how many characters did we buy this month".
CREATE INDEX IF NOT EXISTS idx_tts_cache_created_at ON tts_cache(created_at);

-- Finding prunable blobs: unpinned and not played recently.
CREATE INDEX IF NOT EXISTS idx_tts_cache_prunable ON tts_cache(pinned, last_used_at);

-- Service-role only, like daily_news_templates. Nothing reads this table with
-- the anon key; the browser only ever sees a signed URL handed back by the API.
ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tts_cache IS 'Index of generated TTS audio blobs in the worlds bucket under _tts/. Content-addressed and shared across users.';
COMMENT ON COLUMN tts_cache.hash IS 'sha256 of model|voice|format|text; also the storage path stem (_tts/<hash>.mp3 and .json)';
COMMENT ON COLUMN tts_cache.pinned IS 'True when at least one user saved the article; pinned blobs must never be pruned';

-- Per-user daily generation budget. Cache hits are free and uncounted; only a
-- real ElevenLabs call spends from this. Without it, one client looping the
-- endpoint with fresh text bills the account without limit.
-- Mirrors the existing daily_seeds / daily_seeds_date pair on profiles.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tts_chars_today INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tts_chars_date DATE;

COMMENT ON COLUMN profiles.tts_chars_today IS 'Characters sent to the TTS provider today; resets when tts_chars_date rolls over';

-- Voice selection belongs to a language track: the same user can prefer a
-- different reader for Deutsch than for Español. The ID is picked from the
-- live ElevenLabs API after that API has verified language support.
ALTER TABLE user_tracks
ADD COLUMN IF NOT EXISTS tts_voice_id TEXT;

COMMENT ON COLUMN user_tracks.tts_voice_id IS 'ElevenLabs voice ID selected for this language track; validated against the live API before use';
