import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

type DailyChallenges = {
    date: string | null
    newspaper: boolean
    vocab: boolean
    perfect: boolean
    points_earned: number
}

export async function POST(request: NextRequest) {
    try {
        const { challengeId } = await request.json()

        if (!["newspaper", "vocab", "perfect"].includes(challengeId)) {
            return NextResponse.json({ error: "Invalid challenge ID" }, { status: 400 })
        }

        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            {
                cookies: {
                    get: (name) => cookieStore.get(name)?.value,
                    set: () => { },
                    remove: () => { },
                },
            }
        )

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Fetch current profile
        const { data: profile, error: fetchError } = await supabase
            .from("profiles")
            .select("daily_challenges, seeds")
            .eq("id", user.id)
            .single()

        if (fetchError || !profile) {
            return NextResponse.json({ error: "Profile not found" }, { status: 404 })
        }

        const currentChallenges = (profile.daily_challenges || {
            date: null,
            newspaper: false,
            vocab: false,
            perfect: false,
            points_earned: 0,
        }) as DailyChallenges

        const today = new Date().toISOString().split("T")[0]

        // Reset if different day
        let challenges: DailyChallenges
        if (currentChallenges.date !== today) {
            challenges = {
                date: today,
                newspaper: false,
                vocab: false,
                perfect: false,
                points_earned: 0,
            }
        } else {
            challenges = { ...currentChallenges }
        }

        // Check if already completed
        const alreadyCompleted = challenges[challengeId as keyof Pick<DailyChallenges, "newspaper" | "vocab" | "perfect">]

        let pointsAwarded = 0
        if (!alreadyCompleted) {
            // Mark as complete and award points
            challenges[challengeId as keyof Pick<DailyChallenges, "newspaper" | "vocab" | "perfect">] = true
            challenges.points_earned += 15
            pointsAwarded = 15
        }

        // Update database
        const newSeeds = (profile.seeds || 0) + pointsAwarded

        const { error: updateError } = await supabase
            .from("profiles")
            .update({
                daily_challenges: challenges,
                seeds: newSeeds,
            })
            .eq("id", user.id)

        if (updateError) {
            return NextResponse.json({ error: "Update failed" }, { status: 500 })
        }

        return NextResponse.json({
            challenges,
            pointsAwarded,
            totalSeeds: newSeeds,
        })
    } catch (error) {
        console.error("[/api/challenges/update] Error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
