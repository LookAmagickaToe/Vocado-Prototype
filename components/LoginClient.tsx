"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

declare global {
  interface Window {
    google: any
  }
}

export default function LoginClient() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [emailOrUsername, setEmailOrUsername] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [googleClientIdMissing, setGoogleClientIdMissing] = useState(false)

  // Initialize Google Sign-In
  if (typeof window !== "undefined" && !window.google && !isLoading) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      if (!googleClientIdMissing) setGoogleClientIdMissing(true)
    }
  }


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

  /* Legacy Redirect Flow
  const handleGoogle = async () => {
    // ...
  }
  */

  const handleGoogleNative = async (response: any) => {
    try {
      const { credential } = response
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: credential,
      })
      if (error) throw error

      // Ensure profile exists
      if (data?.user) {
        await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.user.id,
            email: data.user.email || "",
            username: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split("@")[0] || "User",
          }),
        })
      }

      router.push("/")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Effect to render button
  const googleButtonRef = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !window.google) return
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID")
      return
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleNative,
        ux_mode: "popup",
      })
      const parent = document.getElementById("google-btn-container")
      if (parent) {
        window.google.accounts.id.renderButton(parent, {
          theme: "outline",
          size: "large",
          shape: "pill", // rounded-lg is ~8px, rectangular is ~4px. Best match.
          width: "100%",
          text: "continue_with",
          logo_alignment: "left"
        })
      }
    } catch (e) {
      console.error("Google Sign-In initialization failed", e)
    }
  }, [googleClientIdMissing])

  return (
    <div className="min-h-screen bg-[#F6F2EB] text-[#3A3A3A] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#3A3A3A]/10 bg-[#FAF7F2] p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <img
            src="/card/card-back.png"
            alt="Vocado"
            className="h-auto w-48 max-w-full object-contain"
          />
          <h1 className="mt-3 text-3xl font-semibold text-[#3A3A3A]">
            Voc<span className="text-[rgb(var(--vocado-accent-rgb))]">ado</span>
          </h1>
        </div>
        <p className="mt-3 text-sm text-[#3A3A3A]/70 text-center">
          {isSignUp ? "Create your account" : "Sign in to continue"}
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="text"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            placeholder="Email or username"
            className="w-full rounded-lg border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-sm text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)]"
          />

          {isSignUp && (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-lg border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-sm text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)]"
            />
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-sm text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)]"
          />
        </div>

        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleAuth}
            disabled={isLoading}
            className="w-full rounded-full border border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb))] px-4 py-2 text-sm text-white font-medium hover:bg-[rgb(var(--vocado-accent-dark-rgb))] disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Loading..." : isSignUp ? "Create account" : "Sign in"}
          </button>

          {/* New Google Button Container */}
          <div id="google-btn-container" className="w-full h-[40px] flex justify-center"></div>

          {googleClientIdMissing && (
            <p className="text-xs text-red-500 text-center">
              Authentication unavailable: Missing Client ID
            </p>
          )}
        </div>

        <div className="mt-6 text-sm text-[#3A3A3A]/70 text-center">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={() => setIsSignUp((prev) => !prev)}
            className="text-[rgb(var(--vocado-accent-rgb))] hover:text-[rgb(var(--vocado-accent-dark-rgb))] font-medium"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  )
}

