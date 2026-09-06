'use client'

/**
 * Lazy browser-client seam (#38). `@supabase/ssr` throws at CONSTRUCTION when
 * NEXT_PUBLIC_SUPABASE_* are absent, so an eager `useMemo(() => createClient(), [])`
 * crashes envless mounts (Storybook, CI) even when every query is seeded or
 * disabled — the trap that broke PR #35's Storybook job.
 *
 * This hook returns a render-stable GETTER instead: nothing is constructed at
 * render; the client is built on first call — inside a queryFn or an event
 * handler, i.e. only when a component actually talks to Supabase — and cached
 * for the component's lifetime. Prod behavior is unchanged (same single client,
 * same failure surfaced, just at use-time instead of mount). Deliberately NOT a
 * central missing-env guard: envless use still fails loudly.
 */
import { useMemo } from 'react'
import { createClient } from './client'

export function useLazySupabase(): () => ReturnType<typeof createClient> {
  return useMemo(() => {
    let client: ReturnType<typeof createClient> | null = null
    return () => (client ??= createClient())
  }, [])
}
