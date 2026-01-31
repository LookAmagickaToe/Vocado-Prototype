# Database Migration Instructions

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
