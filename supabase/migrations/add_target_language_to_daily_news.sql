-- Add target_language column to daily_news table
-- This is needed to store news articles in the target language

ALTER TABLE daily_news
ADD COLUMN IF NOT EXISTS target_language TEXT;

-- Update the composite index to include target_language for better query performance
DROP INDEX IF EXISTS idx_daily_news_lookup;
CREATE INDEX IF NOT EXISTS idx_daily_news_lookup 
ON daily_news (date, category, source_language, target_language, level);
