"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Check, ArrowRight, BookOpen, PartyPopper, Gamepad2, Plus, Newspaper, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getUiSettings } from "@/lib/ui-settings"

export type TutorialStep =
    | "welcome"
    | "tour_intro"
    | "play_intro"
    | "playing_game"
    | "post_game"
    | "create_instruction"
    | "creating"
    | "final"
    | "done"

interface TutorialOverlayProps {
    step: TutorialStep
    onNext: () => void
    onTerminate: () => void // Terminate tutorial completely
    onSaveProfile: (data: { source: string; target: string; level: string; news: string; name: string; avatarUrl: string }) => Promise<void>
    initialSource?: string
    initialTarget?: string
    initialLevel?: string
    initialNews?: string
    initialName?: string
    initialAvatar?: string
    savingProfile?: boolean
    profileError?: string | null
    ui?: any // Optional now as we derive it
}

const AVATARS = [
    "/profilepictures/happy_vocado.png",
    "/profilepictures/maxime_vocado.png",
    "/profilepictures/elviscado.png",
    "/profilepictures/astronauta.png",
    "/profilepictures/bavarian_vocado.png",
    "/profilepictures/bavarian_capybara.png",
    "/profilepictures/beachboy.png",
    "/profilepictures/disco_pop.png",
    "/profilepictures/he_bayern.png",
    "/profilepictures/he_colombian_traveler.png",
    "/profilepictures/he_motorrad.png",
    "/profilepictures/hearts_vocado.jpeg",
    "/profilepictures/princessa_russa.png",
    "/profilepictures/she_bayernshirt.png",
    "/profilepictures/she_capybara_head.png",
    "/profilepictures/vocado_bodybuilder.png"
]

// Common wrapper for modal style content
const ModalWrapper = ({ children, title, subtitle, onTerminate }: { children: React.ReactNode, title: string, subtitle?: string, onTerminate: () => void }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-lg rounded-3xl border border-[rgb(var(--vocado-divider-rgb)/0.2)] bg-[#F6F2EB] p-8 shadow-2xl text-[#3A3A3A] overflow-hidden"
        >
            <div className="absolute top-6 right-6">
                <button onClick={onTerminate} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-[#3A3A3A] mb-2">
                    {title}
                </h2>
                {subtitle && (
                    <p className="text-[#3A3A3A]/60 text-base leading-relaxed">
                        {subtitle}
                    </p>
                )}
            </div>

            {children}
        </motion.div>
    </div>
)

// Floating tooltip style for "in-app" guidance steps
const TooltipWrapper = ({ children, position = "center", onTerminate }: { children: React.ReactNode, position?: "center" | "bottom-right" | "top-right", onTerminate: () => void }) => {
    const posClass = position === "center" ? "items-center justify-center" :
        position === "bottom-right" ? "items-end justify-end pb-12 pr-12" : "items-start justify-end pt-24 pr-12"

    return (
        <div className={`fixed inset-0 z-[90] pointer-events-none flex ${posClass} p-6`}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pointer-events-auto max-w-md rounded-2xl border border-[rgb(var(--vocado-accent-rgb)/0.3)] bg-white/90 p-5 shadow-2xl backdrop-blur text-[#3A3A3A]"
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                        {children}
                    </div>
                    <button onClick={onTerminate} className="ml-4 text-neutral-400 hover:text-neutral-600">
                        <X size={16} />
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

export default function TutorialOverlay({
    step,
    onNext,
    onTerminate,
    onSaveProfile,
    initialSource,
    initialTarget,
    initialLevel,
    initialNews,
    initialName,
    initialAvatar,
    savingProfile,
    profileError,
    ui: parentUi, // Removed fallback usage to ensure dynamic updates
}: TutorialOverlayProps) {
    const [source, setSource] = useState(initialSource || "Español")
    const [target, setTarget] = useState(initialTarget || "English")
    const [level, setLevel] = useState(initialLevel || "A2")
    const [news, setNews] = useState(initialNews || "world")
    const [name, setName] = useState(initialName || "")
    const [avatarUrl, setAvatarUrl] = useState(initialAvatar || AVATARS[0])

    const uiSettings = useMemo(() => getUiSettings(source), [source])
    const tutorialUi = uiSettings.tutorial

    // Sync state if props change (e.g. from existing profile)
    useEffect(() => {
        if (initialSource) setSource(initialSource)
        if (initialTarget) setTarget(initialTarget)
        if (initialLevel) setLevel(initialLevel)
        if (initialNews) setNews(initialNews)
        if (initialName) setName(initialName)
        if (initialAvatar) setAvatarUrl(initialAvatar)
    }, [initialSource, initialTarget, initialLevel, initialNews, initialName, initialAvatar])

    const handleProfileSave = () => {
        onSaveProfile({ source, target, level, news, name, avatarUrl })
    }

    if (step === "welcome") {
        return (
            <ModalWrapper title={tutorialUi.welcomeTitle} subtitle={tutorialUi.welcomeSubtitle} onTerminate={onTerminate}>
                <div className="space-y-6">
                    {/* Avatar Picker */}
                    <div>
                        <label className="text-xs font-bold text-[#3A3A3A] uppercase tracking-widest mb-3 block">
                            {tutorialUi.avatarLabel}
                        </label>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {AVATARS.map((url) => (
                                <button
                                    key={url}
                                    onClick={() => setAvatarUrl(url)}
                                    className={`relative shrink-0 w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${avatarUrl === url
                                        ? "border-[rgb(var(--vocado-accent-rgb))] scale-110 shadow-lg"
                                        : "border-transparent opacity-60 hover:opacity-100"
                                        }`}
                                >
                                    <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                                    {avatarUrl === url && (
                                        <div className="absolute inset-0 bg-[rgb(var(--vocado-accent-rgb))/0.2] flex items-center justify-center">
                                            <Check size={20} className="text-[rgb(var(--vocado-accent-rgb))]" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Name Input */}
                    <div>
                        <label className="text-xs font-bold text-[#3A3A3A] uppercase tracking-widest mb-2 block">
                            {tutorialUi.nameLabel}
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={tutorialUi.namePlaceholder}
                            className="w-full rounded-2xl bg-white border border-[rgb(var(--vocado-divider-rgb)/0.2)] px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb))/0.5] transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-[#3A3A3A] uppercase tracking-widest mb-2 block">{tutorialUi.sourceLabel}</label>
                            <select
                                value={source}
                                onChange={(e) => setSource(e.target.value)}
                                className="w-full rounded-2xl bg-white border border-[rgb(var(--vocado-divider-rgb)/0.2)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb))/0.5]"
                            >
                                {["Español", "Deutsch", "English", "Français", "Português"].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[#3A3A3A] uppercase tracking-widest mb-2 block">{tutorialUi.targetLabel}</label>
                            <select
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full rounded-2xl bg-white border border-[rgb(var(--vocado-divider-rgb)/0.2)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb))/0.5]"
                            >
                                {["Español", "Deutsch", "English", "Français", "Português"].filter(l => l !== source).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-[#3A3A3A] uppercase tracking-widest mb-2 block">{tutorialUi.levelLabel}</label>
                        <div className="grid grid-cols-6 gap-2">
                            {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                                <button
                                    key={lvl}
                                    onClick={() => setLevel(lvl)}
                                    className={`rounded-xl py-2.5 text-xs font-bold transition-all ${level === lvl
                                        ? "bg-[rgb(var(--vocado-accent-rgb))] text-white shadow-md"
                                        : "bg-white border border-[rgb(var(--vocado-divider-rgb)/0.2)] text-[#3A3A3A]/60 hover:border-[rgb(var(--vocado-accent-rgb))/0.4]"
                                        }`}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                    </div>

                    {profileError && (
                        <p className="text-red-500 text-sm font-medium">{profileError}</p>
                    )}

                    <div className="pt-2">
                        <Button
                            onClick={handleProfileSave}
                            disabled={savingProfile || !name.trim()}
                            className="w-full bg-[rgb(var(--vocado-accent-rgb))] text-white hover:opacity-90 font-bold rounded-2xl py-6 text-lg shadow-lg shadow-[rgb(var(--vocado-accent-rgb))/0.2] disabled:opacity-50"
                        >
                            {savingProfile ? tutorialUi.saving : tutorialUi.startJourney}
                        </Button>
                    </div>
                </div>
            </ModalWrapper>
        )
    }

    if (step === "tour_intro") {
        return (
            <ModalWrapper title={tutorialUi.tourTitle} subtitle={tutorialUi.tourSubtitle} onTerminate={onTerminate}>
                <div className="space-y-6">
                    <div className="space-y-4 text-sm text-neutral-300">
                        <div className="flex gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                <Gamepad2 size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-100">{tutorialUi.tourWorldsTitle}</h3>
                                <p className="text-neutral-400">{tutorialUi.tourWorldsDesc}</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                                <Newspaper size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-100">{tutorialUi.tourSmartTitle}</h3>
                                <p className="text-neutral-400">{tutorialUi.tourSmartDesc}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button
                            onClick={onNext}
                            className="bg-neutral-100 text-neutral-900 hover:bg-white font-semibold rounded-xl px-6 flex items-center gap-2"
                        >
                            {tutorialUi.letsPlay} <ArrowRight size={16} />
                        </Button>
                    </div>
                </div>
            </ModalWrapper>
        )
    }

    // Steps that are overlaying the actual app
    if (step === "play_intro") {
        return (
            <TooltipWrapper position="center" onTerminate={onTerminate}>
                <h3 className="text-lg font-bold text-green-400 mb-2">{tutorialUi.playIntroTitle}</h3>
                <p className="text-sm text-neutral-300 mb-4" dangerouslySetInnerHTML={{ __html: tutorialUi.playIntroDesc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 w-1/4 animate-pulse" />
                </div>
            </TooltipWrapper>
        )
    }

    if (step === "playing_game") {
        return (
            <TooltipWrapper position="bottom-right" onTerminate={onTerminate}>
                <h3 className="text-lg font-bold text-blue-400 mb-2">{tutorialUi.playingTitle}</h3>
                <p className="text-sm text-neutral-300">
                    {tutorialUi.playingDesc}
                </p>
            </TooltipWrapper>
        )
    }

    if (step === "post_game") {
        return (
            <ModalWrapper title={tutorialUi.postGameTitle} subtitle={tutorialUi.postGameSubtitle} onTerminate={onTerminate}>
                <div className="space-y-6">
                    <p className="text-neutral-300">
                        {tutorialUi.postGameDesc}
                    </p>

                    <div className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
                        <h4 className="font-medium text-neutral-200 mb-2 flex items-center gap-2">
                            <Plus size={16} className="text-green-400" /> {tutorialUi.createTitle}
                        </h4>
                        <p className="text-xs text-neutral-400 whitespace-pre-line">
                            {tutorialUi.createExamples}
                        </p>
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={onNext} className="bg-neutral-100 text-neutral-900 hover:bg-white rounded-xl">
                            {tutorialUi.tryCreating}
                        </Button>
                    </div>
                </div>
            </ModalWrapper>
        )
    }

    if (step === "create_instruction") {
        return (
            <TooltipWrapper position="top-right" onTerminate={onTerminate}>
                <h3 className="font-semibold text-neutral-100 mb-1">{tutorialUi.createInstructionTitle}</h3>
                <p className="text-sm text-neutral-400" dangerouslySetInnerHTML={{ __html: tutorialUi.createInstructionDesc }} />
            </TooltipWrapper>
        )
    }

    if (step === "creating") {
        // Hidden, waiting for user to finish creation
        return null
    }

    if (step === "final") {
        return (
            <ModalWrapper title={tutorialUi.finalTitle} subtitle={tutorialUi.finalSubtitle} onTerminate={onTerminate}>
                <div className="text-center space-y-6 py-4">
                    <div className="mx-auto w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 mb-4">
                        <PartyPopper size={40} />
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-neutral-900/50 rounded-xl">
                            <div className="text-xl font-bold text-neutral-100">50</div>
                            <div className="text-[10px] uppercase font-bold text-neutral-500 mt-1">{tutorialUi.pointsAwarded}</div>
                        </div>
                        <div className="p-3 bg-neutral-900/50 rounded-xl opacity-50">
                            <div className="text-xl font-bold text-neutral-100">Daily</div>
                            <div className="text-[10px] uppercase font-bold text-neutral-500 mt-1">{tutorialUi.dailyChallenge}</div>
                        </div>
                        <div className="p-3 bg-neutral-900/50 rounded-xl opacity-50">
                            <div className="text-xl font-bold text-neutral-100">News</div>
                            <div className="text-[10px] uppercase font-bold text-neutral-500 mt-1">{tutorialUi.newsReader}</div>
                        </div>
                    </div>

                    <p className="text-lg text-neutral-200">
                        {tutorialUi.finalDesc}
                    </p>

                    <Button size="lg" onClick={onNext} className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl text-lg font-semibold h-12">
                        {tutorialUi.finish}
                    </Button>
                </div>
            </ModalWrapper>
        )
    }

    return null
}
