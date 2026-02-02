# Gemini API Keys Configuration

The application uses **two separate Gemini API keys** to track costs for different features independently.

## Environment Variables

### Required API Keys

1. **`GEMINI_API_KEY_NEWS`** - For news generation
   - Used in: `/api/cron/news` (daily news generation)
   - Purpose: Track costs for automated news article processing

2. **`GEMINI_API_KEY_WORLDS`** - For world generation
   - Used in: `/api/ai` (custom world generation from user prompts)
   - Purpose: Track costs for user-requested vocabulary list generation

### Fallback Behavior

Both keys will fall back to `GEMINI_API_KEY` if not set, allowing for:
- **Development**: Use a single key (set only `GEMINI_API_KEY`)
- **Production**: Use separate keys for cost tracking

## Setup Instructions

### Option 1: Separate Keys (Recommended for Production)

Add to your `.env`:

```bash
# News generation (automated daily cron job)
GEMINI_API_KEY_NEWS=your_news_api_key_here

# World generation (user-triggered prompts)
GEMINI_API_KEY_WORLDS=your_worlds_api_key_here
```

### Option 2: Single Key (Development/Testing)

Add to your `.env`:

```bash
# Fallback for both features
GEMINI_API_KEY=your_single_api_key_here
```

## Cost Tracking

With separate keys, you can track costs in the Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Create two separate API keys (or use existing ones)
4. Set custom labels/names to identify each:
   - "Vocado News Generation"
   - "Vocado World Generation"
5. View usage and costs separately in **Billing** section

## Feature Breakdown

| Feature | API Key | Typical Usage | Cost Driver |
|---------|---------|---------------|-------------|
| **News Generation** | `GEMINI_API_KEY_NEWS` | Automated cron job (daily) | Number of news articles × languages × levels |
| **World Generation** | `GEMINI_API_KEY_WORLDS` | User-triggered prompts | Number of user requests × complexity |

## Files Modified

- `/app/api/cron/news/route.ts` - Uses `GEMINI_API_KEY_NEWS`
- `/app/api/ai/route.ts` - Uses `GEMINI_API_KEY_WORLDS`

## Migration from Single Key

If you're currently using `GEMINI_API_KEY`:

1. Keep your existing setup working (both routes will fall back to `GEMINI_API_KEY`)
2. When ready, create two new API keys in Google Cloud
3. Add `GEMINI_API_KEY_NEWS` and `GEMINI_API_KEY_WORLDS` to your `.env`
4. Remove `GEMINI_API_KEY` (optional - can keep as fallback)
5. Restart your application

No code changes needed - just update environment variables!
