You are working inside an existing codebase.

STRICT RULES

Reuse existing logic, components, Supabase integration, navigation, and state handling

Do NOT rewrite existing functions

Do NOT introduce gamification

Do NOT introduce new services or abstractions

Only new system allowed without confirmation: Spaced Repetition

All new UI must visually match the existing Home screen branding exactly

0. GLOBAL DESIGN SYSTEM (MANDATORY)

All newly built screens, overlays, tables, cards, buttons, headers, and navigation must strictly follow the existing Home screen design language.

Visual Style

Very light

Warm

Calm

Adult

Premium

Editorial / newspaper-like

AI-first but invisible

Colors (no deviation)

Main background: warm cream / beige
#F6F2EB, #FAF7F2

Secondary surfaces: slightly darker beige

Accent: desaturated avocado green
#9FB58E

Text: warm dark gray
#3A3A3A

Dividers: extremely subtle, barely visible

❌ No pure white
❌ No black
❌ No saturated green
❌ No hard contrast

Surfaces & Shapes

Soft, calm cards

Rounded corners (subtle, not playful)

Light paper-like feeling

Very soft shadows or none

Generous whitespace

Typography

Calm, readable

No bold headlines

Hierarchy via spacing and size

Editorial / newspaper feel

1. Internationalization (FIRST STEP)

Add all new screens and overlays to the existing language package system

Remove all hardcoded strings

Replace with translation keys

Reuse the existing i18n helpers exactly as implemented

2. Prompt → World Generation Flow (Overlay)

Submitting a prompt:

Generates a World

Opens a review overlay (not a new screen)

Overlay Design

Same cream background as Home

No modal frame feeling

Feels embedded and calm

Overlay Structure (top → bottom)

Top right

Subtle ✕ icon

Cancels overlay (no save)

Title

Editable text

Calm typography (not bold)

World classification

Text: “Diese Wörter gehören zu:”

List of existing worlds

One selected

Optional: create new world

Words table

Clean editorial table

No cards

No color coding except subtle gray

Columns:

Word (source)

Translation

Status (e.g. neu / bekannt / unsicher)

Generate more words (below table)

Counter input

Calm button

On click:

Include all existing words in AI request

Prevent regeneration

Filter response to unique source-language words

Bottom actions

Left: Save

Right: Play Now (accent avocado green)

Play Now

Save world to Supabase

Immediately open game screen

3. Game Screen (Reuse Existing)
Header

Left: Back arrow
→ returns to last screen (not overlay)

Center:

Default: “Vocado”

If user learned words today:
“Heute gelernt: X Wörter”

Right:

Seeds text: 452 🌱 (plain text, no badge)

Profile circle

Body

Reuse existing memory gameplay

Adapt spacing, colors, surfaces to match new design

No new animations

4. Game Finish → Review Carousel

Reuse existing winning carousel logic.

Card behavior

Initial state: source language only

On tap: card flips

Back side:

Source + target

Explanation

Verb conjugation if applicable

Below the card (outside carousel)

Three small buttons:

Easy

Medium

Difficult

Buttons are calm, text-based, no gamified colors.

5. Spaced Repetition System (NEW)

Implement a bucket-based SRS.

Buckets

Hard

Medium

Easy

Each vocabulary stores:

bucket

lastReviewedAt

nextReviewAt

Rating logic

Easy:

Move toward easier bucket

Increase interval exponentially

Medium:

Stay or small progression

Difficult:

Move toward harder bucket

Short interval

Persistence

Save progress to Supabase after every word

User can stop anytime without losing progress

Vocabulary must no longer live exclusively inside world JSONs.
Worlds reference vocabulary IDs.

6. Home Screen – Review Card

Reuse existing Review card.

Behavior:

Starts memory game

Selects most urgent words:

nextReviewAt <= now

Prioritize harder buckets

UI:

No progress bars

No streaks

Calm text only

7. Worlds Screen
Layout

Top center: small search bar

Bottom right: floating plus button

Plus button

On click:

Two radial options:

Select from library

Upload

Upload

Button animates into large ellipse

Transforms into prompt input

Same behavior as Home prompt

Opens review overlay after generation

Library remains mockup only.

8. Vocables Screen

Accessible via footer tab “Vocables”.

Body

Vertical list of SRS buckets

Hard at top → Easy at bottom

Bucket click

Starts Anki-style review

Uses only words in that bucket

Saves progress continuously

9. Bottom Navigation

Reuse existing footer.

Tabs:

Home

Worlds

Vocables

Me

Style:

Light background

Text + icon

Active tab slightly avocado-green

Very low contrast

10. Friends Screen

Reuse leaderboard exactly as is.
No visual or logic changes.

Product Principles (DO NOT VIOLATE)

No daily goals

No streaks

No gamification

Learning is calm, continuous, self-directed

AI is never explicitly shown

Short Design Summary (for generators)

Light, cream-beige, avocado-green AI-first language learning app.
Calm editorial design, newspaper-style news, user-driven learning worlds, explicit review flow, premium and adult, no gamification.