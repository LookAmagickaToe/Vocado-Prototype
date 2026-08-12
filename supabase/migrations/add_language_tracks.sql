-- Per-language separation of learning content ("tracks"), plus regional varieties.
--
-- Before this migration everything a user learned — worlds, lists, the word index —
-- was keyed on user_id alone. Switching from Deutsch to English in Profile left all
-- the German content on screen, because nothing recorded which language it belonged
-- to. This adds that dimension.
--
-- A TRACK is one thing the user is learning: a (source_language, target_language)
-- pair. source_language is the native/UI language, target_language is the language
-- being learned. Each track carries its own CEFR level. Seeds, streak, daily
-- challenges and the leaderboard stay global to the profile and are untouched here.
--
-- A VARIANT is a regional variety of the language being learned (bayerisch,
-- colombiano, valencia). It is NOT a separate track — it is a lens over one:
--
--     standard Deutsch  ->  rows WHERE variant IS NULL
--     Bayerisch         ->  rows WHERE variant IS NULL OR variant = 'bayerisch'
--
-- Base words are shared, variety words are private. Switching to Bayerisch keeps
-- every standard German word already learned, with its SRS progress intact,
-- because it is literally the same row. Five varieties cost five tags over one
-- shared pool rather than five copies of it.
--
-- This migration is additive and backfilling: no column is dropped, and every
-- existing row is assigned to the user's current profile pair, so existing users
-- see exactly what they saw before on first load.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_tracks — the durable per-track state, one row per settings tab
-- ─────────────────────────────────────────────────────────────────────────────
-- profiles.source_language / target_language / level keep their current meaning:
-- WHICH TRACK IS ACTIVE RIGHT NOW. Switching tabs copies a user_tracks row into
-- those columns. That is what lets ~12 server pages and every client component
-- keep reading profiles unchanged.

CREATE TABLE IF NOT EXISTS user_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_language TEXT NOT NULL,          -- native / UI language, e.g. 'Español'
  target_language TEXT NOT NULL,          -- language being learned, e.g. 'Deutsch'
  variant TEXT,                           -- variety slug; NULL = standard form
  level TEXT,                             -- per-track CEFR level
  position INTEGER NOT NULL DEFAULT 0,    -- tab order
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),

  -- One tab per language pair. The variety is a setting inside the tab, not a
  -- second tab, so it is deliberately absent from this key.
  UNIQUE (user_id, source_language, target_language)
);

CREATE INDEX IF NOT EXISTS idx_user_tracks_user ON user_tracks(user_id, position);

ALTER TABLE user_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own tracks" ON user_tracks;
CREATE POLICY "Users can manage their own tracks"
ON user_tracks
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE user_tracks IS 'One row per language a user is learning; profiles holds whichever one is currently active';
COMMENT ON COLUMN user_tracks.variant IS 'Regional variety slug (lib/languages.ts VARIANTS); NULL means the standard form';

-- The active variety. The pair and level already live on profiles.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS active_variant TEXT;

COMMENT ON COLUMN profiles.active_variant IS 'Variety slug of the active track; NULL means the standard form';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Scope the learning tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE world_files
ADD COLUMN IF NOT EXISTS source_language TEXT,
ADD COLUMN IF NOT EXISTS target_language TEXT,
ADD COLUMN IF NOT EXISTS variant TEXT;

ALTER TABLE lists
ADD COLUMN IF NOT EXISTS source_language TEXT,
ADD COLUMN IF NOT EXISTS target_language TEXT,
ADD COLUMN IF NOT EXISTS variant TEXT;

ALTER TABLE user_words
ADD COLUMN IF NOT EXISTS source_language TEXT,
ADD COLUMN IF NOT EXISTS target_language TEXT,
ADD COLUMN IF NOT EXISTS variant TEXT;

COMMENT ON COLUMN user_words.variant IS 'Variety the word is specific to; NULL means it is standard and every variety of this language inherits it';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill — assign everything that already exists to the user's current pair
-- ─────────────────────────────────────────────────────────────────────────────
-- COALESCE to the same defaults the code uses (lib/track.ts DEFAULT_SOURCE /
-- DEFAULT_TARGET) so no row is left NULL and orphaned from every track.
-- variant stays NULL: existing words are standard-form words, which is exactly
-- what makes them inherit into any variety the user picks later.

UPDATE world_files wf
SET source_language = COALESCE(p.source_language, 'Español'),
    target_language = COALESCE(p.target_language, 'Deutsch')
FROM profiles p
WHERE p.id = wf.user_id
  AND wf.source_language IS NULL;

UPDATE lists l
SET source_language = COALESCE(p.source_language, 'Español'),
    target_language = COALESCE(p.target_language, 'Deutsch')
FROM profiles p
WHERE p.id = l.user_id
  AND l.source_language IS NULL;

UPDATE user_words uw
SET source_language = COALESCE(p.source_language, 'Español'),
    target_language = COALESCE(p.target_language, 'Deutsch')
FROM profiles p
WHERE p.id = uw.user_id
  AND uw.source_language IS NULL;

-- Rows whose user has no profile row at all (shouldn't happen, but a NULL here
-- would make the row invisible to every track).
UPDATE world_files SET source_language = 'Español', target_language = 'Deutsch'
WHERE source_language IS NULL;
UPDATE lists SET source_language = 'Español', target_language = 'Deutsch'
WHERE source_language IS NULL;
UPDATE user_words SET source_language = 'Español', target_language = 'Deutsch'
WHERE source_language IS NULL;

-- Seed one track per existing profile from whatever is currently active.
INSERT INTO user_tracks (user_id, source_language, target_language, variant, level, position)
SELECT id,
       COALESCE(source_language, 'Español'),
       COALESCE(target_language, 'Deutsch'),
       NULL,
       level,
       0
FROM profiles
ON CONFLICT (user_id, source_language, target_language) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Keep stored normalization keys in step with lib/words.ts
-- ─────────────────────────────────────────────────────────────────────────────
-- normalizeWord() now strips a leading elided article ("l'aigua" -> "aigua").
-- Apostrophes survive its cleanup (English needs them for "don't"), so an elided
-- article never became its own token and rows written by the old function still
-- carry the "l'" prefix. Without this they would stop matching what the new
-- function produces, and the user would be offered words they already have.
--
-- ORDER MATTERS: this runs BEFORE the uniqueness rule below. Stripping the
-- prefix can collapse "l'eau" onto an existing "eau", and adding the constraint
-- first would make that a violation instead of a merge.

ALTER TABLE user_words
DROP CONSTRAINT IF EXISTS user_words_user_id_norm_source_norm_target_key;

UPDATE user_words
SET norm_source = regexp_replace(norm_source, '^l''\s*', '')
WHERE norm_source LIKE 'l''%';

UPDATE user_words
SET norm_target = regexp_replace(norm_target, '^l''\s*', '')
WHERE norm_target LIKE 'l''%';

-- Merge any pair the re-normalization just collapsed, keeping the physically
-- first row. Both rows described the same word, so nothing is lost.
DELETE FROM user_words a
USING user_words b
WHERE a.ctid > b.ctid
  AND a.user_id = b.user_id
  AND a.source_language = b.source_language
  AND a.target_language = b.target_language
  AND a.norm_source = b.norm_source
  AND a.norm_target = b.norm_target;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes and the new uniqueness rule
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_world_files_track
  ON world_files(user_id, source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_lists_track
  ON lists(user_id, source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_user_words_track
  ON user_words(user_id, source_language, target_language);

-- News matching runs on the target-language word within a track.
DROP INDEX IF EXISTS idx_user_words_user_target;
CREATE INDEX IF NOT EXISTS idx_user_words_track_target
  ON user_words(user_id, source_language, target_language, norm_target);

-- The old constraint made a word unique per user. It now has to be unique per
-- user PER TRACK, so the same spelling can exist in two languages the user is
-- learning. variant is deliberately NOT part of the key: re-encountering 'Haus'
-- while studying Bayerisch must dedupe onto the existing standard row rather
-- than forking a second copy the learner would have to learn again.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_words_track_word_key'
  ) THEN
    ALTER TABLE user_words
    ADD CONSTRAINT user_words_track_word_key
    UNIQUE (user_id, source_language, target_language, norm_source, norm_target);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Varieties need their own generated news
-- ─────────────────────────────────────────────────────────────────────────────
-- daily_news is a pool shared across users, keyed on (date, category,
-- source_language, target_language, level). A Bayerisch learner must not be
-- served the standard-German article, so the variety joins the key.

ALTER TABLE daily_news
ADD COLUMN IF NOT EXISTS variant TEXT;

DROP INDEX IF EXISTS idx_daily_news_lookup;
CREATE INDEX IF NOT EXISTS idx_daily_news_lookup
ON daily_news (date, category, source_language, target_language, level, variant);

COMMENT ON COLUMN daily_news.variant IS 'Regional variety the article is written in; NULL means the standard form';
