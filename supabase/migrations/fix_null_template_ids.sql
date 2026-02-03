-- Fix NULL template_id values in daily_news by matching to daily_news_templates
-- This script matches based on: date, category, level, source_url, and title

UPDATE daily_news dn
SET template_id = dnt.id
FROM daily_news_templates dnt
WHERE 
    dn.template_id IS NULL
    AND dn.date = dnt.date
    AND dn.category = dnt.category
    AND dn.level = dnt.level
    AND dn.source_url = dnt.source_url
    AND dn.title = dnt.title;

-- Verify the update
SELECT 
    COUNT(*) as total_entries,
    COUNT(template_id) as entries_with_template_id,
    COUNT(*) - COUNT(template_id) as entries_still_null
FROM daily_news;
