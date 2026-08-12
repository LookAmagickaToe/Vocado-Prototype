-- Global index of the words a user already has.
-- The actual vocabulary lives as JSON blobs in the `worlds` storage bucket, which
-- cannot be queried. This table mirrors those pools so we can answer
-- "does this user already know word X?" when generating new words or when
-- extracting vocabulary from a news article.

CREATE TABLE IF NOT EXISTS user_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  norm_source TEXT NOT NULL,  -- normalizeWord() of source, see lib/words.ts
  norm_target TEXT NOT NULL,  -- normalizeWord() of target, see lib/words.ts
  source TEXT NOT NULL,       -- original spelling, for display
  target TEXT NOT NULL,
  pos TEXT,
  world_id TEXT,              -- world the word first came from, informational
  origin TEXT,                -- 'theme' | 'news' | 'selection' | 'import'
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, norm_source, norm_target)
);

-- Bulk lookup of everything a user knows
CREATE INDEX IF NOT EXISTS idx_user_words_user ON user_words(user_id);

-- News matching runs on the target-language word (the word being learned),
-- not on its translation.
CREATE INDEX IF NOT EXISTS idx_user_words_user_target ON user_words(user_id, norm_target);

ALTER TABLE user_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own words" ON user_words;
CREATE POLICY "Users can manage their own words"
ON user_words
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Marks when the one-time backfill from existing world blobs ran, so a user with
-- a genuinely empty vocabulary does not trigger a storage scan on every request.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS words_indexed_at TIMESTAMPTZ;

COMMENT ON TABLE user_words IS 'Queryable index of every vocabulary word a user has, mirrored from the worlds storage bucket';
COMMENT ON COLUMN user_words.norm_target IS 'Normalized target word: accent-folded, lowercased, leading article stripped (lib/words.ts normalizeWord)';
COMMENT ON COLUMN profiles.words_indexed_at IS 'Timestamp of the one-time user_words backfill from existing world JSON blobs';
