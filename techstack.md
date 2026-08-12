# Vocado App Tech Stack

This document outlines the complete technology stack used in the **Vocado** application, a language learning and vocabulary memory tool. The stack is heavily focused on modern, high-performance web development utilizing the React ecosystem and serverless capabilities.

## 1. Core Framework & Languages
- **Next.js (v15.2.6)**: The application is built on the Next.js framework using the modern **App Router** paradigm (`app/` directory). Next.js provides hybrid static & server rendering, file-based routing, and easy API route creation.
- **React (v19)**: The latest version of the React library is used for building the user interfaces, leveraging React 19's capabilities like server components and enhanced hooks.
- **TypeScript (v5)**: The entire codebase is strictly typed with TypeScript, ensuring robust code quality, better developer experience, and fewer runtime errors.
- **Node.js**: The underlying JavaScript runtime environment.

## 2. Infrastructure & Hosting
- **Vercel**: The application is configured to deploy seamlessly to Vercel (indicated by `vercel.json`), taking full advantage of Vercel's edge network and serverless functions for Next.js.
- **Vercel Analytics & Speed Insights**: Integrated tools (`@vercel/analytics`, `@vercel/speed-insights`) for real-time traffic monitoring and performance metrics tracking natively on the Vercel platform.
- **Package Manager**: **pnpm** (indicated by `pnpm-lock.yaml`) is used for managing dependencies, ensuring fast and deterministic installations.

## 3. Database & Authentication
- **Supabase**: Serves as the primary Backend-as-a-Service (BaaS), handling PostgreSQL database interactions, real-time subscriptions, and authentication.
- **Supabase SSR (`@supabase/ssr`)**: Used for secure, server-side authentication flows. This includes Next.js Middleware (`middleware.ts`) that intercepts requests to protect private routes (redirecting unauthenticated users to `/login`) and securely passes session cookies.
- **Supabase JS Client (`@supabase/supabase-js`)**: Used for client and server-side interactions with the Supabase database.

## 4. UI Library & Styling
- **Tailwind CSS (v3)**: A utility-first CSS framework that provides the core styling system. It includes plugins like `tailwindcss-animate` for easy CSS animations.
- **shadcn/ui**: The application uses shadcn/ui for its component architecture. This is evident through the inclusion of:
  - **Radix UI Primitives (`@radix-ui/react-*`)**: Headless, accessible UI components (Accordion, Dialog, Tabs, Popover, Select, etc.) forming the base of shadcn components.
  - **Tailwind Merge (`tailwind-merge`) & clsx**: Utilities used collaboratively to dynamically construct and merge Tailwind class names cleanly.
  - **CVA (`class-variance-authority`)**: Used to create reusable Tailwind CSS component variants.
- **Icons**: **Lucide React** (`lucide-react`) provides a consistent, beautiful, and customizable set of SVG icons.

## 5. Animation & Interactions
- **Framer Motion**: The industry-standard animation library for React, enabling fluid, complex, and declarative animations for components and page transitions.
- **tailwindcss-animate**: Adds helpful Tailwind utility classes for standard, lightweight CSS animations used across the app's components.
- **Drag & Drop / Gestures**: **Vaul** (`vaul`) is used specifically for fluid, touch-friendly bottom drawer components common in mobile-friendly designs.

## 6. Forms & Data Validation
- **React Hook Form**: Handles complex form state, user inputs, and submissions without causing unnecessary re-renders.
- **Zod**: A TypeScript-first schema declaration and validation library. It is paired with React Hook Form via **Hookform Resolvers** (`@hookform/resolvers`) to enforce strict, type-safe validation rules for user input data before it hits the backend.

## 7. AI & Generative Features
- **Google Gemini API**: Integrated via `app/api/ai/route.ts`, the application extensively uses the `gemini-2.0-flash-lite-001` model to generate contextually aware educational content.
  - Tasks handled by AI include parsing messy vocabulary text, extracting words from images via Google AI vision capabilities, generating verb conjugations, crafting story-based exercises, and summarizing news articles adjusted for different CEFR language proficiency levels (A1, B1, etc.).

## 8. Specialized Utilities & Plugins
- **CMDK (`cmdk`)**: An unstyled React command menu component, likely used for quick action palettes (like a spotlight search).
- **Embla Carousel React (`embla-carousel-react`)**: A bare-bones, highly extensible carousel library for navigating through vocabulary cards or multi-step views.
- **Recharts**: A composable charting library built on React components, used for visualizing user progress, streaks, and analytics in dashboard views.
- **Date-fns & React Day Picker**: Used heavily for managing, interpreting, and selecting calendar dates (tracking daily streaks or review schedules).
- **Sonner (`sonner`) & Radix Toast**: High-performance, unstyled toast notification systems for user feedback alerts.
- **Next Themes (`next-themes`)**: Managing easily toggleable Dark/Light modes for the application natively compatible with Next.js App Router and Tailwind.
- **Input OTP (`input-otp`)**: Accessible One-Time-Password input component, likely used in secure verification flows.
- **React Resizable Panels (`react-resizable-panels`)**: For creating customizable, draggable panel UI layouts within advanced views.
