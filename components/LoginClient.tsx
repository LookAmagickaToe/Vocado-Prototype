"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function LoginClient() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [emailOrUsername, setEmailOrUsername] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)


  const resolveEmail = async (value: string) => {
    if (value.includes("@")) return value
    const response = await fetch("/api/auth/username-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: value }),
    })
    if (!response.ok) {
      throw new Error("Username not found")
    }
    const data = await response.json()
    return data.email as string
  }

  const handleAuth = async () => {
    setError(null)
    setIsLoading(true)
    try {
      if (isSignUp) {
        if (!emailOrUsername.includes("@")) {
          throw new Error("Please sign up with a valid email address.")
        }
        if (!username.trim()) {
          throw new Error("Username is required.")
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: emailOrUsername.trim().toLowerCase(),
          password: password.trim(),
          options: {
            data: { username: username.trim() },
          },
        })
        if (signUpError) throw signUpError
        if (data.user?.id) {
          await fetch("/api/auth/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: data.user.id,
              email: data.user.email,
              username: username.trim(),
            }),
          })
        }
        if (data.session) {
          router.push("/")
        } else {
          setIsSignUp(false)
          setError("Account created. Please check your email to confirm, then sign in.")
          router.push("/login")
        }
        return
      }

      const email = (await resolveEmail(emailOrUsername.trim())).trim().toLowerCase()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: password.trim(),
      })
      if (signInError) throw signInError
      router.push("/")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const redirectTo = `${window.location.origin}/auth/callback`
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      })
      if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "true") {
        console.log("[auth][client] oauth response", { data, oauthError, redirectTo })
      }
      if (oauthError) throw oauthError
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
      const fallbackUrl =
        baseUrl.length > 0
          ? `${baseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`
          : ""
      const oauthUrl = data?.url ?? fallbackUrl
      if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "true") {
        console.log("[auth][client] oauth redirect", { oauthUrl })
      }
      if (!oauthUrl) {
        throw new Error("OAuth did not return a redirect URL.")
      }
      window.location.assign(oauthUrl)
    } catch (err) {
      setError((err as Error).message)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <img
            src="/card/card-back.png"
            alt="Vocado"
            className="h-auto w-48 max-w-full object-contain"
          />
          <h1 className="mt-3 text-3xl font-semibold">
            Voc<span className="text-green-500">ado</span>
          </h1>
        </div>
        <p className="mt-3 text-sm text-neutral-300 text-center">
          {isSignUp ? "Create your account" : "Sign in to continue"}
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="text"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            placeholder="Email or username"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
          />

          {isSignUp && (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
            />
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
          />
        </div>

        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleAuth}
            disabled={isLoading}
            className="w-full rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : isSignUp ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={isLoading}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm text-neutral-200 hover:text-white disabled:opacity-50"
          >
            Continue with Google
          </button>
        </div>

        <div className="mt-6 text-sm text-neutral-300">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={() => setIsSignUp((prev) => !prev)}
            className="text-green-400 hover:text-green-300"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  )
}
