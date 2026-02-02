# Helper: Integrate Supabase CLI

To allow me (your AI agent) to run database commands directly, please follow these steps once.

## 1. Install Supabase CLI
You can install it via Homebrew or NPM.

**Homebrew (Mac/Linux):**
```bash
brew install supabase/tap/supabase
```

**NPM (Alternative):**
```bash
npm install -g supabase
```

## 2. Login to Supabase
This authenticates your machine. I will inherit this session.
```bash
supabase login
```
*Follow the instructions to copy/paste the API token from your browser.*

## 3. Link Your Project
Connect this folder to your remote Supabase project. You need your **Project Reference ID** (found in Supabase Dashboard > Project Settings > General > Reference ID).

```bash
supabase link --project-ref <your-project-ref>
```
*You will be asked for your database password.*

## 4. How I will use it
Once linked, I can strictly use:
-   `supabase db push`: To apply my local SQL changes to your remote database safely.
-   `supabase migration new`: To create properly timestamped migration files.

## Verification
Run this to check if it's working:
```bash
supabase status
```
