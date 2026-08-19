-- Per-language learning tracks, compatible with the current Vocado schema.
--
-- Some installations do not have the `user_words` index yet. All
-- changes to that table are guarded, so this migration can be safely run before
-- or after add_user_words.sql. If add_user_words.sql is applied later, rerun
-- this migration once to add and backfill its language columns.

CREATE TABLE IF NOT EXISTS user_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  variant TEXT,
  level TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, source_language, target_language)
);

CREATE INDEX IF NOT EXISTS idx_user_tracks_user ON user_tracks(user_id, position);
ALTER TABLE user_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own tracks" ON user_tracks;
CREATE POLICY "Users can manage their own tracks"
ON user_tracks FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_variant TEXT;

-- Existing content tables are present in this database. Add a language scope
-- before backfilling it from each owner's current profile settings.
ALTER TABLE world_files
  ADD COLUMN IF NOT EXISTS source_language TEXT,
  ADD COLUMN IF NOT EXISTS target_language TEXT,
  ADD COLUMN IF NOT EXISTS variant TEXT;

ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS source_language TEXT,
  ADD COLUMN IF NOT EXISTS target_language TEXT,
  ADD COLUMN IF NOT EXISTS variant TEXT;

ALTER TABLE daily_news ADD COLUMN IF NOT EXISTS variant TEXT;

UPDATE world_files wf
SET source_language = COALESCE(p.source_language, 'Español'),
    target_language = COALESCE(p.target_language, 'Deutsch')
FROM profiles p
WHERE p.id = wf.user_id AND wf.source_language IS NULL;

UPDATE lists l
SET source_language = COALESCE(p.source_language, 'Español'),
    target_language = COALESCE(p.target_language, 'Deutsch')
FROM profiles p
WHERE p.id = l.user_id AND l.source_language IS NULL;

UPDATE world_files SET source_language = 'Español', target_language = 'Deutsch'
WHERE source_language IS NULL;
UPDATE lists SET source_language = 'Español', target_language = 'Deutsch'
WHERE source_language IS NULL;

INSERT INTO user_tracks (user_id, source_language, target_language, variant, level, position)
SELECT id,
       COALESCE(source_language, 'Español'),
       COALESCE(target_language, 'Deutsch'),
       active_variant,
       level,
       0
FROM profiles
ON CONFLICT (user_id, source_language, target_language) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_world_files_track
  ON world_files(user_id, source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_lists_track
  ON lists(user_id, source_language, target_language);

DROP INDEX IF EXISTS idx_daily_news_lookup;
CREATE INDEX IF NOT EXISTS idx_daily_news_lookup
ON daily_news (date, category, source_language, target_language, level, variant);

-- Some installations have not created the word index yet. Skip this section
-- when it is absent; rerunning after add_user_words.sql applies it safely.
DO $$
BEGIN
  IF to_regclass('public.user_words') IS NOT NULL THEN
    ALTER TABLE user_words
      ADD COLUMN IF NOT EXISTS source_language TEXT,
      ADD COLUMN IF NOT EXISTS target_language TEXT,
      ADD COLUMN IF NOT EXISTS variant TEXT;

    UPDATE user_words uw
    SET source_language = COALESCE(p.source_language, 'Español'),
        target_language = COALESCE(p.target_language, 'Deutsch')
    FROM profiles p
    WHERE p.id = uw.user_id AND uw.source_language IS NULL;

    UPDATE user_words SET source_language = 'Español', target_language = 'Deutsch'
    WHERE source_language IS NULL;

    -- A word used to be unique across the entire user. It must now be unique
    -- inside a language pair so identical spellings can exist in two tracks.
    -- Drop both possible constraints first so rerunning this migration is safe.
    ALTER TABLE user_words
      DROP CONSTRAINT IF EXISTS user_words_user_id_norm_source_norm_target_key,
      DROP CONSTRAINT IF EXISTS user_words_track_word_key;

    -- Keep stored normalization in step with lib/words.ts. This can collapse
    -- old l' forms onto an existing row, so merge duplicates before recreating
    -- the uniqueness constraint.
    UPDATE user_words
    SET norm_source = regexp_replace(norm_source, '^l''\s*', '')
    WHERE norm_source LIKE 'l''%';

    UPDATE user_words
    SET norm_target = regexp_replace(norm_target, '^l''\s*', '')
    WHERE norm_target LIKE 'l''%';

    DELETE FROM user_words a
    USING user_words b
    WHERE a.ctid > b.ctid
      AND a.user_id = b.user_id
      AND a.source_language = b.source_language
      AND a.target_language = b.target_language
      AND a.norm_source = b.norm_source
      AND a.norm_target = b.norm_target;

    CREATE INDEX IF NOT EXISTS idx_user_words_track
      ON user_words(user_id, source_language, target_language);

    DROP INDEX IF EXISTS idx_user_words_user_target;
    CREATE INDEX IF NOT EXISTS idx_user_words_track_target
      ON user_words(user_id, source_language, target_language, norm_target);

    ALTER TABLE user_words
      ADD CONSTRAINT user_words_track_word_key
      UNIQUE (user_id, source_language, target_language, norm_source, norm_target);
  END IF;
END $$;
