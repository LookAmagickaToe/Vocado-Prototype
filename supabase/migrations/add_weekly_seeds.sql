-- Add weekly seeds tracking columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS weekly_seeds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekly_seeds_week_start TEXT;

-- Create index for efficient weekly leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_weekly_seeds ON profiles(weekly_seeds DESC);
