# News Display Fix & Refresh Button

**Date**: 2026-02-03  
**Status**: ✅ Fixed

## Problem
1. Cached news items weren't displaying properly after generation - even though 4 items were cached, they weren't showing up
2. Only 2 old cached news items were showing in the `/news` tab
3. No way to force a refresh to get the latest news from the server

## Root Cause
When news translations are cached in the database, they're stored as JSON **strings** in the `json` column. However, when cached data was being retrieved and returned to the frontend, the code was returning the raw database row (which has a string `json` field) instead of the **parsed world object**.

## Changes Made

### 1. Fixed API Data Parsing (`lib/news/service.ts`)
**Lines 21-42**: Updated the cached translation return logic to parse the `json` field before returning:

```typescript
if (existingTranslation) {
    console.log(`[translate] Cache hit for ${templateId} -> ${targetLanguage}`)
    
    // Parse the json field if it's a string
    let worldData = existingTranslation.json
    if (typeof worldData === 'string') {
        try {
            worldData = JSON.parse(worldData)
        } catch (e) {
            console.error(`Failed to parse cached JSON for ${templateId}:`, e)
        }
    }
    
    if (worldData) {
        console.log(`[translate] Returning cached data with keys: ${Object.keys(worldData).join(', ')}`)
        return {
            success: true,
            cached: true,
            data: worldData  // Now returns parsed object, not raw database row
        }
    }
}
```

### 2. Added Defensive Parsing (`app/api/news/daily/route.ts`)
**Lines 90-123**: Added backup parsing in the API route to handle edge cases:

```typescript
const result = await translateNewsTemplate(template.id, targetLabel, sourceLabel)
// Parse the data if it's a cached database row with a json field
let worldData = result.data

if (worldData && typeof worldData === 'object' && 'json' in worldData) {
    // This is a raw database row, parse the json field
    const jsonField = worldData.json
    if (typeof jsonField === 'string') {
        try {
            worldData = JSON.parse(jsonField)
        } catch (e) {
            console.error(`Failed to parse JSON for template ${template.id}:`, e)
            return null
        }
    } else {
        worldData = jsonField
    }
}

return worldData
```

### 3. Added Refresh Button (`components/NewsClient.tsx`)
**Lines 1483-1505**: Added a 🔄 icon button in the top right header of the `/news` page:

- **Location**: Top right of the page header, next to the seeds counter
- **Style**: Icon-only circular button with hover effect
- **Function**: Clears localStorage cache and forces a fresh API call

```tsx
<div className="flex items-center gap-3">
  <button
    type="button"
    onClick={async () => {
      if (typeof window !== "undefined") {
        const sessionKey = `${category}|${profileState.level}|${profileState.sourceLanguage}|${profileState.targetLanguage}`
        const cacheKey = `${LOCAL_NEWS_CACHE_PREFIX}:${sessionKey}`
        window.localStorage.removeItem(cacheKey)
      }
      setNewsWorlds([])
      setIsLoadingHeadlines(true)
      await ensureDailyNewsList(category)
      setIsLoadingHeadlines(false)
    }}
    className="h-9 w-9 rounded-full border border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/70 hover:bg-[#EBE7DF] hover:text-[#3A3A3A] transition-colors flex items-center justify-center"
    title="Refresh news from server"
  >
    🔄
  </button>
  <div className="text-xs text-[#3A3A3A]/70">
    <span className="font-semibold">{seeds}</span> 🌱
  </div>
</div>
```

## Visual Design

The refresh button appears in the sticky header:
```
┌─────────────────────────────────────────────────┐
│                                       🔄  123 🌱 │
│              Vocado Zeitung                     │
│           03 de febrero de 2026                 │
└─────────────────────────────────────────────────┘
```

- **Icon**: 🔄 (refresh/reload emoji)
- **Size**: 36px × 36px circular button
- **Position**: Top right corner, always visible in sticky header
- **Hover**: Darkens background color for visual feedback

## Expected Results

### Home Screen (`/`)
- All cached news items with proper titles and teasers now display correctly
- News cards no longer appear blank
- All 4-5 cached items are visible

### News Page (`/news`)
- All available news items display properly
- Refresh button (🔄) is always visible in the top right corner
- Clicking the refresh button clears cache and fetches fresh news from the API
- Button provides visual hover feedback
- Tooltip shows "Refresh news from server" on hover

## Testing
1. Navigate to `/news`
2. You should see all available news items (up to 5 per category)
3. Look at the top right corner - you'll see the 🔄 icon next to the seeds counter
4. Click the 🔄 button to fetch the latest news from the server
5. The page will briefly show a loading state, then display fresh news
6. Switch between categories (World, Economy, Sport) - the refresh works for each category

## Technical Notes
- The refresh button clears localStorage cache specific to the current category/level/language combination
- Button is always accessible in the sticky header, even when scrolling
- Icon-only design keeps the header clean and uncluttered
- Hover state provides clear visual feedback for interactivity
- The localStorage cache still provides fast initial loads, but now users have control to refresh
