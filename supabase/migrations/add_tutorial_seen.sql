-- Add tutorial_seen field to profiles table
-- This tracks whether a user has completed the tutorial
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tutorial_seen BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_tutorial_seen ON profiles(tutorial_seen);
