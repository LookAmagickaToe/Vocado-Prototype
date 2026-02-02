"use client"

import React, { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { clsx } from "clsx"
import { ArrowRight, Play } from "lucide-react"
import { getUiSettings } from "@/lib/ui-settings"

// Theme colors
const COLORS = {
    bg: "#F2F0E9",
    accent: "rgb(var(--vocado-accent-rgb))", // Assuming this CSS variable is available, else fallback
    accentGreen: "#22c55e", // tailwind green-500
    text: "#3A3A3A",
}

type ScreenData = {
    title: string
    body: string
    image: string
}

const IMAGE_PATHS = [
    "/tutorial/welcome.png",
    "/tutorial/news.png",
    "/tutorial/memorygame.png",
    "/tutorial/streak.png",
    "/tutorial/dailychallenge.png",
    "/tutorial/prompt.png",
]

interface TutorialOverlayProps {
    onComplete: () => void
    sourceLanguage?: string
}

export default function TutorialOverlay({ onComplete, sourceLanguage = "English" }: TutorialOverlayProps) {
    const [index, setIndex] = useState(0)

    const uiSettings = useMemo(() => getUiSettings(sourceLanguage), [sourceLanguage])
    const tutorialData = uiSettings?.tutorial || {}
    const slides = tutorialData.slides || []

    // Merge i18n slides with image paths
    const SCREENS: ScreenData[] = useMemo(() => {
        if (slides.length === 6) {
            return slides.map((slide: any, i: number) => ({
                title: slide.title,
                body: slide.body,
                image: IMAGE_PATHS[i],
            }))
        }
        // Fallback to English if no slides
        return [
            {
                title: "Welcome to Vocado 🌿",
                body: "Grow your vocabulary through play, real-world news, and AI-powered memory games.",
                image: "/tutorial/welcome.png",
            },
            {
                title: "Learn from the News 📰",
                body: "We turn Tagesschau headlines into your personal playground, tailored to your level.",
                image: "/tutorial/news.png",
            },
            {
                title: "Play to Remember 🃏",
                body: "Match pairs to clear levels. Master words with specialized conjugation modes.",
                image: "/tutorial/memorygame.png",
            },
            {
                title: "Don't Let it Rot! 🥑",
                body: "Grow from a Seed to Ripe over 7 days. Harvest your streak for a massive bonus!",
                image: "/tutorial/streak.png",
            },
            {
                title: "Daily Goals 🎯",
                body: "Boost XP with three fresh challenges daily: Newspaper, Vocab, and Perfect Scores.",
                image: "/tutorial/dailychallenge.png",
            },
            {
                title: "AI Magic ✨",
                body: "Create custom worlds from any theme. Just type 'At the bakery' and start playing.",
                image: "/tutorial/prompt.png",
            },
        ]
    }, [slides])
    const isLast = index === SCREENS.length - 1

    const handleNext = () => {
        if (isLast) {
            onComplete()
        } else {
            setIndex((prev) => prev + 1)
        }
    }

    // Slide variants
    const variants = {
        enter: { x: 300, opacity: 0 },
        center: { x: 0, opacity: 1 },
        exit: { x: -300, opacity: 0 },
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-[#F2F0E9] p-8 shadow-2xl">
                {/* Top Image */}
                <div className="mb-8 h-48 w-full rounded-2xl overflow-hidden bg-[#E5E5E5] flex items-center justify-center">
                    <img
                        src={SCREENS[index].image}
                        alt={SCREENS[index].title}
                        className="h-full w-full object-contain"
                    />
                </div>

                {/* Content Area with Animation */}
                <div className="relative mb-12 h-32">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={index}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="absolute inset-0 flex flex-col items-center text-center"
                        >
                            <h2 className="mb-3 text-2xl font-bold text-[#3A3A3A]">
                                {SCREENS[index].title}
                            </h2>
                            <p className="text-base leading-relaxed text-[#3A3A3A]/70">
                                {SCREENS[index].body}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Navigation Bar */}
                <div className="flex flex-col items-center gap-6">
                    {/* Dots */}
                    <div className="flex items-center gap-2">
                        {SCREENS.map((_, i) => (
                            <motion.div
                                key={i}
                                initial={false}
                                animate={{
                                    width: i === index ? 24 : 8,
                                    backgroundColor: i === index ? "#22c55e" : "rgba(58, 58, 58, 0.2)",
                                }}
                                className="h-2 rounded-full transition-colors"
                            />
                        ))}
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleNext}
                        className={clsx(
                            "flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition-transform active:scale-95",
                            isLast ? "bg-green-500 hover:bg-green-600" : "bg-[#3A3A3A] hover:bg-black"
                        )}
                    >
                        {isLast ? (
                            <>
                                {tutorialData.letsPlayButton || "Let's Play!"} <Play size={20} fill="currentColor" />
                            </>
                        ) : (
                            <>
                                {tutorialData.continueButton || "Continue"} <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
