# Database Migration Instructions

## Language tracks (`add_language_tracks.sql`)

Adds per-language separation of learning content, regional varieties, and the
`user_tracks` table. Apply it the same way as any other migration (SQL Editor, or
`supabase db push`).

It is additive and backfilling — no column is dropped, and every existing row is
assigned to the user's current profile language pair, so existing users see exactly
what they saw before on first load.

### Verify after applying

Every one of these should come back empty or zero:

```sql
-- 1. No learning row was left unassigned to a track.
SELECT 'world_files' AS table_name, count(*) FROM world_files WHERE source_language IS NULL
UNION ALL SELECT 'lists',      count(*) FROM lists      WHERE source_language IS NULL
UNION ALL SELECT 'user_words', count(*) FROM user_words WHERE source_language IS NULL;

-- 2. Every profile got exactly one seeded track (expect zero rows back).
SELECT p.id, count(t.id) AS tracks
FROM profiles p LEFT JOIN user_tracks t ON t.user_id = p.id
GROUP BY p.id HAVING count(t.id) <> 1;

-- 3. The new uniqueness rule is in place and the old one is gone.
SELECT conname FROM pg_constraint WHERE conrelid = 'user_words'::regclass AND contype = 'u';
-- expect: user_words_track_word_key   (and NOT user_words_user_id_norm_source_norm_target_key)

-- 4. No stored normalization key still carries an elided article.
SELECT count(*) FROM user_words WHERE norm_source LIKE 'l''%' OR norm_target LIKE 'l''%';
```

### Rolling back

`user_tracks` and the added columns can be dropped without touching existing data:

```sql
DROP TABLE IF EXISTS user_tracks;
ALTER TABLE world_files DROP COLUMN IF EXISTS source_language,
                        DROP COLUMN IF EXISTS target_language,
                        DROP COLUMN IF EXISTS variant;
-- ...same for lists and user_words, then restore the old constraint:
ALTER TABLE user_words DROP CONSTRAINT IF EXISTS user_words_track_word_key;
ALTER TABLE user_words ADD CONSTRAINT user_words_user_id_norm_source_norm_target_key
  UNIQUE (user_id, norm_source, norm_target);
```

Note the `l'` re-normalization in step 4 of the migration is **not** reversible — it
rewrites stored keys to match `lib/words.ts`. That is intentional; reverting the
code without reverting the data would leave the two out of step again.

## Apply Database Indexes to Supabase

To apply the database indexes that will dramatically improve `/news` page performance:

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `supabase/migrations/add_daily_news_indexes.sql`
4. Copy the SQL content
5. Paste it into the SQL Editor
6. Click **Run** to execute the migration

### Option 2: Via Supabase CLI

If you have the Supabase CLI installed:

```bash
# From project root
supabase db push
```

## Verify Indexes Were Created

Run this query in the Supabase SQL Editor to verify the indexes:

```sql
SELECT 
    indexname, 
    indexdef 
FROM 
    pg_indexes 
WHERE 
    tablename = 'daily_news' 
ORDER BY 
    indexname;
```

You should see the following indexes:
- `idx_daily_news_lookup` (composite: date, category, source_language, level)
- `idx_daily_news_date` (single column: date)
- `idx_daily_news_source_url` (single column: source_url)

## Expected Performance Improvement

- **Before**: `/news` page loads in 60+ seconds
- **After**: `/news` page loads in under 3 seconds (typically under 1 second)
