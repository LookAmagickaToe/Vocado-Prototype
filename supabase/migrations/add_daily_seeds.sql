-- Add daily seeds tracking columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS daily_seeds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_seeds_date TIMESTAMP WITH TIME ZONE;

-- Create index for efficient daily leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_daily_seeds ON profiles(daily_seeds DESC);

-- Update existing profiles to have today's date
UPDATE profiles
SET daily_seeds_date = CURRENT_DATE
WHERE daily_seeds_date IS NULL;
