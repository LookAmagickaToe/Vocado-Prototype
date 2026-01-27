# Vocado - Project Overview

**Vocado** is a gamified language learning application that combines memory card mechanisms with AI-generated content to help users expand their vocabulary.

## Core Features

### 🎮 Gameplay
-   **Memory Match**: Classic memory card game where users match source language words with target language translations.
-   **Dynamic Content**: Vocabulary sets are generated dynamically or curated into "Worlds" (e.g., Daily News, specific topics).
-   **Progression**: Users earn **Seeds** (currency) and XP for verifying matches and completing levels.

### 📰 Daily News (AI-Powered)
-   **Real-world Content**: Fetches daily news headlines (e.g., from Tagesschau).
-   **AI Processing**: Uses AI to generate summaries and extract key vocabulary from articles.
-   **Interactive Learning**: Users "play" the news article to learn the specific words found in the text.
-   **Smart Sync**: Robust synchronization ensures progress (seeds/words) is saved even with poor connectivity, using a strict "highest value wins" strategy to preventing data loss.

### 🏆 Gamification & Social
-   **Leaderboards**: Global and Weekly leaderboards to compete with other users.
-   **Daily Goals**: Track daily streaks, games played, and words learned.
-   **Profile Stats**: visual tracking of Seeds gathered and total revenue.
-   **Experience System**: Multipliers for perfect games and speed.

### ⚙️ Personalization
-   **Language Pairs**: Support for multiple source and target languages (e.g., German, English, French, Spanish, Italian).
-   **Settings**: Adjustable difficulty (levels A1-C2) and preferred news categories.
-   **Onboarding**: Guided tutorial for new users.

## Tech Stack

### Frontend
-   **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **UI Library**: [Radix UI](https://www.radix-ui.com/) (accessible primitives) & [Lucide React](https://lucide.dev/) (icons)
-   **Animations**: [Framer Motion](https://www.framer.com/motion/)

### Backend & Services
-   **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL)
-   **AI Integration**: Custom API routes (`/api/ai`) for generating vocab/translations.
-   **Hosting**: Vercel (recommended for cron jobs/edge functions).

### State Management
-   **Hybrid Strategy**: Optimistic local state (React `useState` + `localStorage`) synced periodically with Supabase to ensure a snappy, offline-tolerant experience.
