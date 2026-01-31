-- Add composite index for daily_news table to optimize the most common query pattern
-- This index will significantly speed up queries that filter by date, category, source_language, and level

-- Composite index for the main query pattern in /api/news/daily
CREATE INDEX IF NOT EXISTS idx_daily_news_lookup 
ON daily_news (date, category, source_language, level);

-- Single column index for date (useful for cleanup queries and date-based filtering)
CREATE INDEX IF NOT EXISTS idx_daily_news_date 
ON daily_news (date);

-- Optional: Index on source_url for faster duplicate checking in share route
CREATE INDEX IF NOT EXISTS idx_daily_news_source_url 
ON daily_news (source_url);
