'use client'

/**
 * Which pond am I in? (#313)
 *
 * The active pond rides in the URL as `?pond=<id>`, beside the page's `?nodeId=`
 * — the app's only addressing convention, read independently by each surface
 * (`Rail.tsx:943`, `DocumentPanel.tsx:67`, `AITerminal.tsx:406`,
 * `ShellCommands.tsx`). A path segment and a cookie-only context were both
 * rejected on #313.
 *
 * With no `?pond=`, the first pond in switcher order is active — so an existing
 * person lands in `life` exactly as before.
 */

import { useSearchParams } from 'next/navigation'
import type { Pond } from './client'

/** The `?pond=` id, or null when the URL does not name one. */
export function useActivePondId(): string | null {
  return useSearchParams().get('pond')
}

/** Resolve the active pond against a list, falling back to the first. */
export function resolveActivePond(ponds: Pond[], activeId: string | null): Pond | null {
  if (!ponds.length) return null
  return ponds.find((p) => p.id === activeId) ?? ponds[0]
}

/**
 * The href that switches to a pond. Drops `?nodeId=` on purpose: a page id from
 * one pond means nothing in another, so switching lands on the new pond's root.
 *
 * `s6m6` says "the page you left stays open for when you come back", which needs
 * a per-pond last-page record — `ponds.last_page_id` exists for it in 0018 and is
 * not wired up yet. Carried on #312.
 */
export function pondHref(pondId: string): string {
  return `/workspace?pond=${encodeURIComponent(pondId)}`
}
