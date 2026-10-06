'use client'

/**
 * The composer card's height once it holds a thread. The card never grows with
 * the thread: it sits at `COMPOSER_DEFAULT_HEIGHT` and the thread scrolls inside
 * it, until the person drags `ComposerHandle` — that height persists so it
 * survives reload, and a double-click on the handle clears it back to the default.
 *
 * Split like the content column's width (`content-width`): the handle reports
 * clamped live changes and gesture-end commits; this hook owns the state and
 * persistence. Storage is throw-tolerant (privacy modes, quota) and degrades to
 * the default rather than crash.
 */

import { useEffect, useState } from 'react'
import { COMPOSER_BOTTOM_INSET } from '@/lib/layout/composer-clearance'

export const COMPOSER_HEIGHT_KEY = 'pond:composer-height'
/**
 * The card with a thread, until the person resizes it: the tallest state the
 * board draws (`PondComposer` `proposing`, measured at 316 with the board's own
 * copy), so every drawn state — a diff card's accept and reject included — fits
 * without scrolling.
 */
export const COMPOSER_DEFAULT_HEIGHT = 316
/** Floor: the thread head, one line of thread, the line and the toolbar. */
export const COMPOSER_MIN_HEIGHT = 160
/** Arrow-key nudge per press on the handle. */
export const COMPOSER_HEIGHT_STEP = 24
/** Room above the card for the ⌘K pill: its 20px inset, its 40px, and 12px of air. */
export const COMPOSER_TOP_CLEARANCE = 72
/** The card's tallest: the shell less the room above it and the inset below it. */
export const COMPOSER_MAX_HEIGHT_CSS = `calc(100% - ${COMPOSER_TOP_CLEARANCE + COMPOSER_BOTTOM_INSET}px)`

/** The tallest the card may be in a shell of the given height. */
export function composerMaxHeight(shellHeight: number): number {
  return Math.max(COMPOSER_MIN_HEIGHT, shellHeight - COMPOSER_TOP_CLEARANCE - COMPOSER_BOTTOM_INSET)
}

export function clampComposerHeight(height: number, max: number): number {
  return Math.min(max, Math.max(COMPOSER_MIN_HEIGHT, height))
}

/** The persisted height, floored — or null (the default) on missing/garbage/throwing storage. */
export function readStoredComposerHeight(): number | null {
  try {
    const raw = window.localStorage.getItem(COMPOSER_HEIGHT_KEY)
    if (raw === null) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : Math.max(COMPOSER_MIN_HEIGHT, parsed)
  } catch {
    return null
  }
}

export function storeComposerHeight(height: number | null) {
  try {
    if (height === null) window.localStorage.removeItem(COMPOSER_HEIGHT_KEY)
    else window.localStorage.setItem(COMPOSER_HEIGHT_KEY, String(height))
  } catch {
    /* ignore persistence failures */
  }
}

/**
 * Height state for the composer card. `setHeight` is the live drag path (state
 * only, no storage churn per pointermove); `commitHeight` is the gesture-end /
 * keyboard / reset path (state + persist). `null` is the default height.
 */
export function useComposerHeight() {
  const [height, setHeightState] = useState<number | null>(null)

  // Client-only restore: reading storage during SSR would mismatch the server
  // markup, so the first frame is the default (the same trade content-width makes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from an external store (localStorage), read client-side to avoid SSR mismatch
    setHeightState(readStoredComposerHeight())
  }, [])

  const setHeight = (next: number) => setHeightState(next)
  const commitHeight = (next: number | null) => {
    setHeightState(next)
    storeComposerHeight(next)
  }

  return { height, setHeight, commitHeight }
}
