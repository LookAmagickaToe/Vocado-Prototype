"use client"

import type { SRSBucket, VocabPair, VocabSRS } from "@/types/worlds"

// Default intervals in days for each bucket
const BUCKET_INTERVALS: Record<SRSBucket, number> = {
    hard: 1,
    medium: 3,
    easy: 7,
}

// Multipliers for rating adjustments
const RATING_MULTIPLIERS = {
    easy: 2.5,
    medium: 1.5,
    difficult: 0.5,
}

/**
 * Calculate the next review state based on current bucket and user rating
 */
export function calculateNextReview(
    currentSRS: VocabSRS | undefined,
    rating: "easy" | "medium" | "difficult"
): VocabSRS {
    const now = new Date().toISOString()
    const currentBucket = currentSRS?.bucket ?? "medium"

    let nextBucket: SRSBucket
    let intervalDays: number

    if (rating === "easy") {
        // Move toward easier bucket, increase interval
        nextBucket = currentBucket === "hard" ? "medium" : "easy"
        intervalDays = BUCKET_INTERVALS[nextBucket] * RATING_MULTIPLIERS.easy
    } else if (rating === "medium") {
        // Stay or small progression
        nextBucket = currentBucket
        intervalDays = BUCKET_INTERVALS[nextBucket] * RATING_MULTIPLIERS.medium
    } else {
        // Difficult: move toward harder bucket, short interval
        nextBucket = currentBucket === "easy" ? "medium" : "hard"
        intervalDays = BUCKET_INTERVALS[nextBucket] * RATING_MULTIPLIERS.difficult
    }

    // Calculate next review date
    const nextReviewDate = new Date()
    nextReviewDate.setDate(nextReviewDate.getDate() + Math.max(1, Math.round(intervalDays)))

    return {
        bucket: nextBucket,
        lastReviewedAt: now,
        nextReviewAt: nextReviewDate.toISOString(),
    }
}

/**
 * Initialize SRS data for a new vocabulary item
 */
export function initializeSRS(): VocabSRS {
    return {
        bucket: "medium",
        lastReviewedAt: null,
        nextReviewAt: new Date().toISOString(), // Due immediately for new words
    }
}

/**
 * Check if a vocabulary item is due for review
 */
export function isDueForReview(srs: VocabSRS | undefined): boolean {
    if (!srs?.nextReviewAt) return true // New words are always due
    return new Date(srs.nextReviewAt) <= new Date()
}

/**
 * Select words that are due for review, prioritizing harder buckets
 */
export function selectDueWords(words: VocabPair[], limit: number): VocabPair[] {
    // Filter to due words
    const dueWords = words.filter(word => isDueForReview(word.srs))

    // Sort by bucket priority (hard first) and then by next review date
    const bucketPriority: Record<SRSBucket, number> = { hard: 0, medium: 1, easy: 2 }

    const sorted = dueWords.sort((a, b) => {
        const bucketA = a.srs?.bucket ?? "medium"
        const bucketB = b.srs?.bucket ?? "medium"

        // Primary: bucket priority (harder first)
        if (bucketPriority[bucketA] !== bucketPriority[bucketB]) {
            return bucketPriority[bucketA] - bucketPriority[bucketB]
        }

        // Secondary: earlier review date first
        const dateA = a.srs?.nextReviewAt ? new Date(a.srs.nextReviewAt).getTime() : 0
        const dateB = b.srs?.nextReviewAt ? new Date(b.srs.nextReviewAt).getTime() : 0
        return dateA - dateB
    })

    return sorted.slice(0, limit)
}

/**
 * Count words in each SRS bucket
 */
export function countByBucket(words: VocabPair[]): Record<SRSBucket, number> {
    const counts: Record<SRSBucket, number> = { hard: 0, medium: 0, easy: 0 }

    for (const word of words) {
        const bucket = word.srs?.bucket ?? "medium"
        counts[bucket]++
    }

    return counts
}

/**
 * Count words due for review
 */
export function countDueWords(words: VocabPair[]): number {
    return words.filter(word => isDueForReview(word.srs)).length
}

/**
 * Get words in a specific bucket
 */
export function getWordsByBucket(words: VocabPair[], bucket: SRSBucket): VocabPair[] {
    return words.filter(word => (word.srs?.bucket ?? "medium") === bucket)
}
