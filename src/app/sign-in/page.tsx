'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LINK_ERROR_MESSAGES: Record<string, string> = {
  link_expired: 'that sign-in link has expired or was already used. send yourself a new one.',
  link_invalid: "that sign-in link didn't work. send yourself a new one.",
  auth_failed: "that sign-in link didn't work. send yourself a new one.",
}

function linkErrorMessage(code: string | null): string | null {
  if (!code) return null
  return LINK_ERROR_MESSAGES[code] ?? LINK_ERROR_MESSAGES.link_invalid
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  )
}

function SignInForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(() =>
    linkErrorMessage(searchParams.get('error'))
  )
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setLinkError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Check your email</p>
          <p className="text-sm text-zinc-500">We sent a magic link to {email}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-80">
        <h1 className="text-xl font-semibold">Sign in to Pond</h1>
        <div className="space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full border border-zinc-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
        {(error ?? linkError) && (
          <p role="alert" className="text-sm text-red-600">
            {error ?? linkError}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zinc-900 text-white rounded px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
    </div>
  )
}
