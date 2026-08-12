-- Enable RLS on all tables
ALTER TABLE daily_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_news_templates ENABLE ROW LEVEL SECURITY;

-- Policy for daily_news: Public read access
-- Everyone can read daily news (anon and authenticated)
CREATE POLICY "Public read access"
ON daily_news
FOR SELECT
TO public
USING (true);

-- Policy for lists: Users can manage their own lists
CREATE POLICY "Users can manage their own lists"
ON lists
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy for world_files: Users can manage their own world files
CREATE POLICY "Users can manage their own world files"
ON world_files
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- No policies for allowed_users and daily_news_templates
-- This implicitly denies access to public/anon/authenticated users
-- Only Service Role (admin) can access these tables
