-- Add ripeness level (streak) tracking columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ripeness_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_played_date DATE,
ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS harvest_count INTEGER DEFAULT 0;

-- Create index for efficient streak queries
CREATE INDEX IF NOT EXISTS idx_profiles_ripeness_level ON profiles(ripeness_level DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_harvest_count ON profiles(harvest_count DESC);

-- Update existing profiles to have today's date if they have seeds
UPDATE profiles
SET last_played_date = CURRENT_DATE
WHERE seeds > 0 AND last_played_date IS NULL;
