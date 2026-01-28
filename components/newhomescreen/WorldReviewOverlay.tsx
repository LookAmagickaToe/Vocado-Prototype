"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Play } from "lucide-react"

// Design system colors
const COLORS = {
    bg: "#F6F2EB",
    bgCard: "#FAF7F2",
    accent: "rgb(var(--vocado-accent-rgb))",
    text: "#3A3A3A",
    textMuted: "rgba(58, 58, 58, 0.5)",
    border: "rgba(58, 58, 58, 0.05)",
}

type WordStatus = "new" | "known" | "unsure"

export type ReviewWord = {
    id: string
    source: string
    target: string
    status: WordStatus
    emoji?: string
    explanation?: string
    example?: string
    pos?: "verb" | "noun" | "adj" | "other"
    syllables?: string
    conjugation?: {
        verb: string
        translation: string
        sections: { title: string; rows: string[][] }[]
    }
}

type ReviewOverlayLabels = {
    titlePlaceholder: string
    belongsLabel: string
    newWorldLabel: string
    listUnlisted: string
    listLabel: string
    wordLabel: string
    translationLabel: string
    emojiLabel: string
    posLabel: string
    posVerb: string
    posNoun: string
    posAdj: string
    posOther: string
    explanationLabel: string
    exampleLabel: string
    syllablesLabel: string
    statusLabel: string
    statusNew: string
    statusKnown: string
    statusUnsure: string
    emptyLabel: string
    generateMoreLabel: string
    generateMorePlaceholder: string
    generateMoreButton: string
    generateMoreLoading: string
    saveLabel: string
    playNowLabel: string
}

type WorldReviewOverlayProps = {
    isOpen: boolean
    onClose: () => void
    onSave: (words: ReviewWord[], worldId: string | null, title: string) => void
    onPlayNow: (words: ReviewWord[], worldId: string | null, title: string) => void
    initialWords?: ReviewWord[]
    initialTitle?: string
    existingWorlds?: { id: string; title: string }[]
    existingLists?: { id: string; name: string }[]
    selectedListId?: string | null
    onSelectList?: (listId: string | null) => void
    onGenerateMore?: (count: number, existingWords: ReviewWord[]) => Promise<ReviewWord[]>
    labels?: ReviewOverlayLabels
}

const DEFAULT_LABELS: ReviewOverlayLabels = {
    titlePlaceholder: "Untitled world",
    belongsLabel: "These words belong to:",
    newWorldLabel: "+ New world",
    listUnlisted: "Unlisted",
    listLabel: "Add to list",
    wordLabel: "Word",
    translationLabel: "Translation",
    emojiLabel: "Emoji",
    posLabel: "Type",
    posVerb: "verb",
    posNoun: "noun",
    posAdj: "adj",
    posOther: "other",
    explanationLabel: "Explanation",
    exampleLabel: "Example",
    syllablesLabel: "Syllables",
    statusLabel: "Status",
    statusNew: "new",
    statusKnown: "known",
    statusUnsure: "unsure",
    emptyLabel: "No words yet",
    generateMoreLabel: "Generate more",
    generateMorePlaceholder: "Count",
    generateMoreButton: "Generate",
    generateMoreLoading: "Generating...",
    saveLabel: "Save",
    playNowLabel: "Play now",
}

export default function WorldReviewOverlay({
    isOpen,
    onClose,
    onSave,
    onPlayNow,
    initialWords = [],
    initialTitle = "",
    existingWorlds = [],
    existingLists = [],
    selectedListId = null,
    onSelectList,
    onGenerateMore,
    labels = DEFAULT_LABELS,
}: WorldReviewOverlayProps) {
    const [words, setWords] = useState<ReviewWord[]>(initialWords)
    const [title, setTitle] = useState(initialTitle)
    const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null)
    const [isNewWorld, setIsNewWorld] = useState(true)
    const [generateCount, setGenerateCount] = useState(10)
    const [isGenerating, setIsGenerating] = useState(false)

    // Sync props to state when overlay opens with new data
    useEffect(() => {
        if (isOpen) {
            setWords(initialWords)
            setTitle(initialTitle)
            setSelectedWorldId(null)
            setIsNewWorld(true)
            setGenerateCount(10)
            setIsGenerating(false)
        }
    }, [isOpen, initialWords, initialTitle])

    const handleStatusChange = (wordId: string, status: WordStatus) => {
        setWords(prev =>
            prev.map(w => (w.id === wordId ? { ...w, status } : w))
        )
    }

    const handleRemoveWord = (wordId: string) => {
        setWords(prev => prev.filter(w => w.id !== wordId))
    }

    const handleWordChange = (
        wordId: string,
        key: "source" | "target",
        value: string
    ) => {
        setWords(prev =>
            prev.map(w => (w.id === wordId ? { ...w, [key]: value } : w))
        )
    }

    const handleGenerateMore = async () => {
        if (!onGenerateMore || isGenerating) return
        setIsGenerating(true)
        try {
            const newWords = await onGenerateMore(generateCount, words)
            // Filter out duplicates by source word
            const existingSources = new Set(words.map(w => w.source.toLowerCase()))
            const uniqueNewWords = newWords.filter(
                w => !existingSources.has(w.source.toLowerCase())
            )
            setWords(prev => [...prev, ...uniqueNewWords])
        } catch (e) {
            console.error("Failed to generate more words:", e)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSave = () => {
        onSave(words, isNewWorld ? null : selectedWorldId, title)
    }

    const handlePlayNow = () => {
        onPlayNow(words, isNewWorld ? null : selectedWorldId, title)
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                style={{ backgroundColor: COLORS.bg }}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between gap-2" style={{ backgroundColor: `${COLORS.bg}F5` }}>
                    <div className="w-8" /> {/* Spacer for centering */}

                    {/* Editable Title */}
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={labels.titlePlaceholder}
                        className="flex-1 text-center text-[18px] font-medium bg-transparent border-none outline-none"
                        style={{ color: COLORS.text, minWidth: 0 }}
                    />

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                        style={{ color: COLORS.textMuted }}
                    >
                        <X size={20} strokeWidth={1.5} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 pb-32 max-w-lg mx-auto">
                    {/* World Classification */}
                    <section className="mb-6">
                        <p className="text-[12px] font-medium mb-2 px-1" style={{ color: COLORS.textMuted }}>
                            {labels.belongsLabel}
                        </p>
                        <select
                            value={isNewWorld ? "new" : selectedWorldId ?? "new"}
                            onChange={(e) => {
                                const value = e.target.value
                                if (value === "new") {
                                    setIsNewWorld(true)
                                    setSelectedWorldId(null)
                                } else {
                                    setIsNewWorld(false)
                                    setSelectedWorldId(value)
                                }
                            }}
                            className="w-full rounded-[14px] px-3 py-2 text-[13px] bg-transparent outline-none"
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                color: COLORS.text,
                                backgroundColor: COLORS.bgCard,
                            }}
                        >
                            <option value="new">{labels.newWorldLabel}</option>
                            {existingWorlds.map((world) => (
                                <option key={world.id} value={world.id}>
                                    {world.title}
                                </option>
                            ))}
                        </select>
                        {isNewWorld && existingLists.length > 0 && (
                            <div className="mt-3">
                                <p className="text-[11px] font-medium mb-1 px-1" style={{ color: COLORS.textMuted }}>
                                    {labels.listLabel}
                                </p>
                                <select
                                    value={selectedListId ?? "unlisted"}
                                    onChange={(e) => {
                                        const value = e.target.value
                                        if (!onSelectList) return
                                        onSelectList(value === "unlisted" ? null : value)
                                    }}
                                    className="w-full rounded-[14px] px-3 py-2 text-[13px] bg-transparent outline-none"
                                    style={{
                                        border: `1px solid ${COLORS.border}`,
                                        color: COLORS.text,
                                        backgroundColor: COLORS.bgCard,
                                    }}
                                >
                                    <option value="unlisted">{labels.listUnlisted}</option>
                                    {existingLists.map((list) => (
                                        <option key={list.id} value={list.id}>
                                            {list.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </section>

                    {/* Words Table */}
                    <section className="mb-6">
                        <div
                            className="border overflow-x-auto overflow-y-auto rounded-[16px]"
                            style={{
                                borderColor: COLORS.border,
                                backgroundColor: "#FFFFFF",
                                maxHeight: "256px",
                            }}
                        >
                            <div className="min-w-[860px]">
                                {/* Table Header */}
                                <div
                                    className="grid grid-cols-[1.1fr_1.1fr_90px_110px_1.3fr_1.3fr_120px_110px_36px] gap-2 px-2 py-2 text-[11px] font-medium"
                                    style={{
                                        color: COLORS.textMuted,
                                        borderBottom: `1px solid ${COLORS.border}`,
                                    }}
                                >
                                    <span>{labels.wordLabel}</span>
                                    <span>{labels.translationLabel}</span>
                                    <span>{labels.emojiLabel}</span>
                                    <span>{labels.posLabel}</span>
                                    <span>{labels.explanationLabel}</span>
                                    <span>{labels.exampleLabel}</span>
                                    <span>{labels.syllablesLabel}</span>
                                    <span>{labels.statusLabel}</span>
                                    <span />
                                </div>

                                {/* Table Rows */}
                                {words.map((word, index) => (
                                    <div
                                        key={word.id}
                                        className="grid grid-cols-[1.1fr_1.1fr_90px_110px_1.3fr_1.3fr_120px_110px_36px] gap-2 px-2 py-2 items-start"
                                        style={{
                                            borderBottom: index < words.length - 1 ? `1px solid ${COLORS.border}` : undefined,
                                        }}
                                    >
                                        <input
                                            value={word.source}
                                            onChange={(e) => handleWordChange(word.id, "source", e.target.value)}
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        />
                                        <input
                                            value={word.target}
                                            onChange={(e) => handleWordChange(word.id, "target", e.target.value)}
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        />
                                        <input
                                            value={word.emoji ?? ""}
                                            onChange={(e) =>
                                                setWords((prev) =>
                                                    prev.map((entry) =>
                                                        entry.id === word.id
                                                            ? { ...entry, emoji: e.target.value }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        />
                                        <select
                                            value={word.pos ?? "other"}
                                            onChange={(e) =>
                                                setWords((prev) =>
                                                    prev.map((entry) =>
                                                        entry.id === word.id
                                                            ? { ...entry, pos: e.target.value as ReviewWord["pos"] }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        >
                                            <option value="verb">{labels.posVerb}</option>
                                            <option value="noun">{labels.posNoun}</option>
                                            <option value="adj">{labels.posAdj}</option>
                                            <option value="other">{labels.posOther}</option>
                                        </select>
                                        <input
                                            value={word.explanation ?? ""}
                                            onChange={(e) =>
                                                setWords((prev) =>
                                                    prev.map((entry) =>
                                                        entry.id === word.id
                                                            ? { ...entry, explanation: e.target.value }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        />
                                        <input
                                            value={word.example ?? ""}
                                            onChange={(e) =>
                                                setWords((prev) =>
                                                    prev.map((entry) =>
                                                        entry.id === word.id
                                                            ? { ...entry, example: e.target.value }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        />
                                        <input
                                            value={word.syllables ?? ""}
                                            onChange={(e) =>
                                                setWords((prev) =>
                                                    prev.map((entry) =>
                                                        entry.id === word.id
                                                            ? { ...entry, syllables: e.target.value }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="text-[12px] bg-transparent border-b border-transparent focus:border-[#3A3A3A]/20 outline-none"
                                            style={{ color: COLORS.text }}
                                        />
                                        <select
                                            value={word.status}
                                            onChange={(e) => handleStatusChange(word.id, e.target.value as WordStatus)}
                                            className="text-[11px] bg-transparent border-none outline-none"
                                            style={{ color: COLORS.textMuted }}
                                        >
                                            <option value="new">{labels.statusNew}</option>
                                            <option value="known">{labels.statusKnown}</option>
                                            <option value="unsure">{labels.statusUnsure}</option>
                                        </select>
                                        <button
                                            onClick={() => handleRemoveWord(word.id)}
                                            className="p-0.5 rounded opacity-40 hover:opacity-70 transition-opacity mt-0.5"
                                            style={{ color: COLORS.text }}
                                        >
                                            <X size={12} />
                                        </button>
                                        {word.pos === "verb" && word.conjugation?.sections && (
                                            <div className="col-span-full px-2 pb-4 pt-0">
                                                <div className="bg-[#FAF7F2] rounded-lg p-3 border border-[#3A3A3A]/5">
                                                    <div className="text-[11px] font-medium text-[#3A3A3A]/50 mb-2 uppercase tracking-wide">Conjugations</div>
                                                    <div className="grid grid-cols-3 gap-4">
                                                        {word.conjugation.sections.map((section, idx) => (
                                                            <div key={idx} className="bg-white rounded-md p-2 border border-[#3A3A3A]/5">
                                                                <div className="text-[11px] font-semibold text-[#3A3A3A] mb-1.5 border-b border-[#3A3A3A]/5 pb-1">
                                                                    {section.title}
                                                                </div>
                                                                <div className="space-y-0.5">
                                                                    {section.rows.map((row, rIdx) => (
                                                                        <div key={rIdx} className="flex justify-between text-[10px]">
                                                                            <span className="text-[#3A3A3A]/50">{row[0]}</span>
                                                                            <span className="text-[#3A3A3A] font-medium">{row[1]}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {words.length === 0 && (
                                    <div className="px-4 py-8 text-center text-[13px]" style={{ color: COLORS.textMuted }}>
                                        {labels.emptyLabel}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Generate More */}
                    {onGenerateMore && (
                        <section className="mb-6">
                            <div className="flex items-center gap-3">
                                <span className="text-[12px] font-medium" style={{ color: COLORS.textMuted }}>
                                    {labels.generateMoreLabel}
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={generateCount}
                                    onChange={(e) => {
                                        const next = Number(e.target.value)
                                        if (!Number.isFinite(next)) return
                                        const clamped = Math.min(50, Math.max(1, Math.floor(next)))
                                        setGenerateCount(clamped)
                                    }}
                                    placeholder={labels.generateMorePlaceholder}
                                    className="w-20 rounded-full px-3 py-1 text-[12px] bg-transparent"
                                    style={{
                                        border: `1px solid ${COLORS.border}`,
                                        color: COLORS.text,
                                    }}
                                />
                                <button
                                    onClick={handleGenerateMore}
                                    disabled={isGenerating}
                                    className="px-4 py-2 rounded-full text-[12px] font-medium transition-all disabled:opacity-50"
                                    style={{
                                        backgroundColor: COLORS.bgCard,
                                        color: COLORS.text,
                                        border: `1px solid ${COLORS.border}`,
                                    }}
                                >
                                    {isGenerating ? labels.generateMoreLoading : labels.generateMoreButton}
                                </button>
                            </div>
                        </section>
                    )}
                </div>

                {/* Bottom Actions */}
                <div
                    className="fixed bottom-0 left-0 right-0 px-5 py-4 flex items-center justify-between gap-4"
                    style={{
                        backgroundColor: `${COLORS.bg}F8`,
                        backdropFilter: "blur(8px)",
                        borderTop: `1px solid ${COLORS.border}`,
                    }}
                >
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 rounded-full text-[14px] font-medium transition-all"
                        style={{
                            backgroundColor: COLORS.bgCard,
                            color: COLORS.text,
                            border: `1px solid ${COLORS.border}`,
                        }}
                    >
                        {labels.saveLabel}
                    </button>
                    <button
                        onClick={handlePlayNow}
                        className="flex-1 py-3 rounded-full text-[14px] font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                        style={{ backgroundColor: COLORS.accent }}
                    >
                        <Play size={16} fill="white" />
                        {labels.playNowLabel}
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
