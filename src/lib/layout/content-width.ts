'use client'

/**
 * The editor column's user-adjustable width (#58). The column was a fixed
 * max-w-2xl; now the ContentWidthHandle on its right edge drags (or arrow-keys)
 * it anywhere inside [CONTENT_MIN_WIDTH, CONTENT_MAX_WIDTH], and the chosen
 * width persists to localStorage so it survives reload.
 *
 * Split like the terminal drawer's height: the molecule reports clamped live
 * changes and gesture-end commits; this hook owns the state + persistence.
 * The storage helpers are throw-tolerant (privacy modes, quota) and degrade to
 * the default rather than crash — the same contract as AITerminal's
 * readStored/writeStored.
 */

import { useEffect, useState } from 'react'

export const CONTENT_WIDTH_KEY = 'pond:content-width'
/** Narrow floor: below this the title input + Saved chip start colliding. */
export const CONTENT_MIN_WIDTH = 480
/** Wide ceiling: keeps measure readable and clear of the rail on a laptop. */
export const CONTENT_MAX_WIDTH = 1200
/** The incumbent fixed column — max-w-2xl (42rem). */
export const CONTENT_DEFAULT_WIDTH = 672
/** Arrow-key nudge per press on the handle. */
export const CONTENT_WIDTH_STEP = 24

export function clampContentWidth(w: number): number {
  return Math.min(CONTENT_MAX_WIDTH, Math.max(CONTENT_MIN_WIDTH, w))
}

/** The persisted width, clamped — or the default on missing/garbage/throwing storage. */
export function readStoredContentWidth(): number {
  try {
    const raw = window.localStorage.getItem(CONTENT_WIDTH_KEY)
    if (raw === null) return CONTENT_DEFAULT_WIDTH
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? CONTENT_DEFAULT_WIDTH : clampContentWidth(parsed)
  } catch {
    return CONTENT_DEFAULT_WIDTH
  }
}

export function storeContentWidth(width: number) {
  try {
    window.localStorage.setItem(CONTENT_WIDTH_KEY, String(width))
  } catch {
    /* ignore persistence failures */
  }
}

/**
 * Width state for the editor column. `setWidth` is the live drag path (state
 * only — no storage churn per pointermove); `commitWidth` is the gesture-end /
 * keyboard path (state + persist). Both clamp, so no caller can render or
 * store an out-of-band width.
 */
export function useContentWidth() {
  const [width, setWidthState] = useState(CONTENT_DEFAULT_WIDTH)

  // Restore the persisted width on mount. Client-only by design: reading
  // localStorage during SSR/hydration would mismatch the server markup, so we
  // accept one frame at the default width (same trade the terminal height makes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from an external store (localStorage), read client-side to avoid SSR mismatch
    setWidthState(readStoredContentWidth())
  }, [])

  const setWidth = (w: number) => setWidthState(clampContentWidth(w))
  const commitWidth = (w: number) => {
    const clamped = clampContentWidth(w)
    setWidthState(clamped)
    storeContentWidth(clamped)
  }

  return { width, setWidth, commitWidth }
}
