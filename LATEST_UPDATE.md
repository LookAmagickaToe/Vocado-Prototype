# News System Overhaul

**Date**: 2026-02-03  
**Status**: ✅ All Fixed

## Summary
The news system underwent a significant overhaul to address display issues, caching bugs, and missing content. We also added user-controlled refresh capabilities and automatic content generation.

## 1. Fixed News Display Logic
**Problem**: Only 2 news items were showing, and sometimes they were blank.
**Root Cause**: Cached translations in the database were stored as JSON strings. The API was returning these raw strings wrapped in a DB row object instead of the parsed content object.
**Fix**: 
- Updated `lib/news/service.ts` to parse the `json` field before returning.
- Added defensive parsing in `app/api/news/daily/route.ts` as a backup.

## 2. Added Refresh Functionality
**Problem**: Users couldn't force a refresh of news if they wanted to see updates or clear a bad cache.
**Fix**:
- Added a circular **Refresh Button (🔄)** to the `/news` page.
- **Location**: Inline with the category tabs (World, Economy, Sport), on the right side.
- **Icon**: Used `RefreshCw` from Lucide React (cleaner than emoji).
- **Behavior**: Clears localStorage for the current category and forces a fresh API fetch.

## 3. Implemented Auto-Generation (Self-Healing)
**Problem**: The API would sometimes return fewer than 5 items if templates were missing, with no way to generate more on the fly.
**Fix**:
- **New Endpoint**: Created `/api/news/generate` to generate news templates on demand.
- **Shared Logic**: Extracted generation logic into `lib/news/generator.ts` to share between cron and on-demand generation.
- **Smart Logic**: The daily news API now checks if there are fewer than 5 items. If so, it automatically calls the generation endpoint to fill the gap, ensuring the user always sees a full list of 5 stories.

## Visual Changes
### News Page (`/news`)
The category selection row now looks like this:

```
[ World ] [ Economy ] [ Sport ]                                     (🔄)
```

- **Tabs**: On the left
- **Refresh**: On the right (same row)

## Expected Behavior
1. **Always 5 Items**: The system will auto-generate news if needed to ensure 5 stories per category.
2. **Correct Display**: All cards render correctly with titles, images, and summaries (no blank cards).
3. **Control**: Users can click refresh to get the absolute latest status.

## Files Changed
- `components/NewsClient.tsx`: UI changes for the refresh button.
- `lib/news/service.ts`: JSON parsing fixes.
- `app/api/news/daily/route.ts`: Auto-generation trigger logic.
- `app/api/news/generate/route.ts`: New generation endpoint.
- `lib/news/generator.ts`: Shared generation library.
