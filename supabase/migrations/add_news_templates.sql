-- Create daily_news_templates table for storing German language templates
-- This allows us to generate news content once, then translate on-demand

CREATE TABLE IF NOT EXISTS daily_news_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category TEXT NOT NULL,  -- 'world', 'business', 'sport'
  level TEXT NOT NULL,     -- 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  template_json JSONB NOT NULL,  -- Full German template with vocab
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(date, category, level, source_url)
);

-- Index for efficient template lookups
CREATE INDEX IF NOT EXISTS idx_templates_lookup 
ON daily_news_templates(date, category, level);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_templates_date 
ON daily_news_templates(date);

-- Add template_id column to daily_news table to link translations to templates
ALTER TABLE daily_news
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES daily_news_templates(id) ON DELETE SET NULL;

-- Index for template_id lookups
CREATE INDEX IF NOT EXISTS idx_daily_news_template_id 
ON daily_news(template_id);

-- Comments for documentation
COMMENT ON TABLE daily_news_templates IS 'Stores German language templates for news articles, used as base for translation';
COMMENT ON COLUMN daily_news_templates.template_json IS 'Contains article text, vocabulary items, and summary in German';
COMMENT ON COLUMN daily_news.template_id IS 'Links translated news to its source German template';
