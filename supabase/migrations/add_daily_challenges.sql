-- Add daily_challenges column to profiles table
-- This tracks daily challenge completion and points earned

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS daily_challenges JSONB DEFAULT '{
  "date": null,
  "newspaper": false,
  "vocab": false,
  "perfect": false,
  "points_earned": 0
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN profiles.daily_challenges IS 'Tracks daily challenge completion: newspaper (read news), vocab (revise 20 words), perfect (8 pairs in ≤14 moves). Resets daily at midnight.';
