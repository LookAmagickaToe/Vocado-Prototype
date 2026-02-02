import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const token = authHeader.replace("Bearer ", "")

        // Verify user from token
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return NextResponse.json({ error: "Invalid token" }, { status: 401 })
        }

        const body = await req.json()
        const {
            payout = 0,
            challenge_type, // "newspaper" | "vocab" | "perfect"
            daily_seed_increment = 0,
            should_check_streak = false,
            moves, // for perfect challenge check
            pairs_count, // for perfect challenge check
            vocab_increment = 0, // for vocab challenge tracking
            client_date, // YYYY-MM-DD from client
        } = body

        // Fetch current profile
        const { data: profile, error: fetchError } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single()

        if (fetchError || !profile) {
            return NextResponse.json({ error: "Profile not found" }, { status: 404 })
        }

        // Use client date if provided, otherwise server date fallback
        const today = client_date || new Date().toISOString().slice(0, 10)
        // Reference date for calculations (treated as UTC midnight of that day)
        const now = new Date(today)

        // Helper for week start (Monday)
        const getWeekStartIso = (d: Date) => {
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1)
            const monday = new Date(d)
            monday.setDate(diff)
            monday.setHours(0, 0, 0, 0)
            return monday.toISOString()
        }
        const currentWeekStart = getWeekStartIso(now)

        // Parse current daily_challenges
        let dailyChallenges = profile.daily_challenges || {
            date: null,
            newspaper: false,
            vocab: false,
            perfect: false,
            points_earned: 0,
            vocab_progress: 0,
        }

        const challengeDate = dailyChallenges.date?.slice(0, 10)
        let prevAllComplete = false
        if (challengeDate === today) {
            prevAllComplete = dailyChallenges.newspaper && dailyChallenges.vocab && dailyChallenges.perfect
        }

        // Reset daily challenges if date changed
        if (challengeDate !== today) {
            dailyChallenges = {
                date: today,
                newspaper: false,
                vocab: false,
                perfect: false,
                points_earned: 0,
                vocab_progress: 0,
            }
        }

        // Update challenge based on type
        let pointsEarned = 0
        // Update vocab progress if increment provided
        if (vocab_increment > 0) {
            dailyChallenges.vocab_progress = (dailyChallenges.vocab_progress || 0) + vocab_increment
        }

        if (challenge_type === "newspaper" && !dailyChallenges.newspaper) {
            dailyChallenges.newspaper = true
            pointsEarned = 10
        } else if (!dailyChallenges.vocab && (dailyChallenges.vocab_progress || 0) >= 20) {
            // Vocab challenge: 20 words revised total today
            dailyChallenges.vocab = true
            pointsEarned = 15
        }

        // Always check perfect challenge if data provided, regardless of challenge_type
        if (!dailyChallenges.perfect && pairs_count === 8 && moves && moves <= 14) {
            dailyChallenges.perfect = true
            pointsEarned += 20
        } else if (challenge_type === "perfect" && !dailyChallenges.perfect && pairs_count === 8 && moves && moves <= 14) {
            dailyChallenges.perfect = true
            pointsEarned += 20
        }

        dailyChallenges.points_earned = (dailyChallenges.points_earned || 0) + pointsEarned

        // Check if all challenges are now completed
        const newAllComplete = dailyChallenges.newspaper && dailyChallenges.vocab && dailyChallenges.perfect
        const justCompleted = !prevAllComplete && newAllComplete

        // Handle streak
        let ripenessLevel = profile.ripeness_level || 0
        let longestStreak = profile.longest_streak || 0
        const lastPlayedDate = profile.last_played_date

        if (should_check_streak) {
            const yesterday = new Date(now)
            yesterday.setDate(yesterday.getDate() - 1)
            const yesterdayStr = yesterday.toISOString().slice(0, 10)

            // Check if streak is alive (played yesterday or already today)
            // Note: If last played is today, it's alive. If yesterday, it's alive.
            // If older, it's broken.
            const isAlive = lastPlayedDate === today || lastPlayedDate === yesterdayStr

            if (!isAlive && !justCompleted) {
                // Streak broken AND we didn't just restart it by completing a set (though completion implies we played today, 
                // but if we were at 0, we stay 0 until completion. If we were at 5 and missed a day, we go to 0).
                // Actually reset rule: "Not completing any resets it". Meaning if I check in today and last played was 2 days ago,
                // my streak is 0.
                if (lastPlayedDate) {
                    ripenessLevel = 0
                }
            }

            // If it was broken (e.g. 2 days ago), we reset to 0 above.
            // Now, if we Just Completed the set, we increment.
            // Logic: 
            // - If Alive (e.g. 5): JustCompleted -> 6. No -> 5.
            // - If Broken (e.g. 5->0): JustCompleted -> 1. No -> 0.

            // Re-eval reset robustly:
            if (lastPlayedDate && lastPlayedDate < yesterdayStr) {
                ripenessLevel = 0
            }

            if (justCompleted) {
                ripenessLevel++
            }

            longestStreak = Math.max(longestStreak, ripenessLevel)
        }

        // Handle daily seeds
        let dailySeeds = profile.daily_seeds || 0
        const dailySeedsDate = profile.daily_seeds_date?.slice(0, 10)

        if (dailySeedsDate !== today) {
            // Reset daily seeds for new day
            dailySeeds = 0
        }

        dailySeeds += daily_seed_increment + pointsEarned

        // Calculate total seeds
        // Payout is from the game itself, pointsEarned is the bonus from completing a challenge
        const totalSeeds = (profile.seeds || 0) + payout + pointsEarned

        // Handle weekly points
        let weeklySeeds = profile.weekly_seeds || 0
        const weeklySeedsWeekStart = profile.weekly_seeds_week_start

        if (weeklySeedsWeekStart !== currentWeekStart) {
            weeklySeeds = 0
        }

        // Add both game payout and challenge bonus to weekly points
        weeklySeeds += payout + pointsEarned

        // Handle harvest count (every 7 days of streak)
        // Only increment harvest if we JUST completed the milestone (implied by justCompleted transition)
        let harvestCount = profile.harvest_count || 0
        if (justCompleted && ripenessLevel > 0 && ripenessLevel % 7 === 0) {
            harvestCount++
        }

        // Update profile
        const { data: updatedProfile, error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
                daily_challenges: dailyChallenges,
                ripeness_level: ripenessLevel,
                longest_streak: longestStreak,
                last_played_date: should_check_streak ? today : lastPlayedDate,
                daily_seeds: dailySeeds,
                daily_seeds_date: new Date().toISOString(),
                seeds: totalSeeds,
                weekly_seeds: weeklySeeds,
                weekly_seeds_week_start: currentWeekStart,
                harvest_count: harvestCount,
            })
            .eq("id", user.id)
            .select()
            .single()

        if (updateError) {
            console.error("Profile update error:", updateError)
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            profile: updatedProfile,
            challenge_points_earned: pointsEarned,
            payout,
            total_seeds: totalSeeds,
            ripeness_level: ripenessLevel,
            daily_seeds: dailySeeds,
            weekly_seeds: weeklySeeds,
            harvest_count: harvestCount,
        })

    } catch (error) {
        console.error("Profile update error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
