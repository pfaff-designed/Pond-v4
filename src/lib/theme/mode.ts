'use client'

/**
 * Light or dark — the one switch `PondCommand` carries at rest (`Pond 02` 2g,
 * `command-palette.md`: "a mode toggle sits beside the chip"). Dark is the
 * existing `.dark` role block in `globals.css`, applied to `<html>` so every
 * surface, portals included, reads it. The choice persists per browser, and
 * `mode-boot` re-applies it before first paint so a dark pond never flashes paper.
 *
 * The ground can also be HELD for a while — `zen, on ink` (`Pond 06.17` 6q
 * frame 10) sets the page on ink whatever the person chose, and a live preview
 * (the new-pond sheet's theme pills) holds it on paper or ink the same way. A
 * hold is not a choice: it is never stored, `useMode` keeps reporting and
 * toggling the person's own mode beneath it, and when the last hold lifts that
 * choice is what applies. Holds stack: each acquire forces its own ground and
 * the newest still-held one wins, so releasing a stale hold underneath a newer
 * one leaves the ground alone. After boot, this module is the only writer of
 * the `.dark` class.
 */

import { useCallback, useSyncExternalStore } from 'react'

import { MEDIA_QUERY, MODE_KEY, type StoredMode } from './mode-boot'

export type Mode = 'light' | 'dark'

/** Who holds the ground now, oldest first — each hold is its own token, with the ground it forces. */
const holds: { token: symbol; dark: boolean }[] = []
/** The person's mode while the ground is held; null when nothing holds it. */
let heldChoice: Mode | null = null
/** toggleMode's own record of the person's pick, for when storage can't hold it (private mode). */
let explicitChoice: Mode | null = null
const listeners = new Set<() => void>()

const classMode = (): Mode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

const readMode = (): Mode => heldChoice ?? classMode()

/** Only `light`/`dark` win outright; anything else — absent, garbage, unreadable — is `system`. */
const readStoredMode = (): StoredMode => {
  if (explicitChoice !== null) return explicitChoice
  try {
    const stored = window.localStorage.getItem(MODE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** The flip in flight's own double-rAF pair, so an overlapping flip can cancel it. */
let pendingFrame: number | null = null
let pendingFrame2: number | null = null

/**
 * Flips `.dark` with transitions suppressed for one frame (`[data-theme-switching]`,
 * `globals.css`) so every surface snaps together instead of fading at its own speed.
 * The double `requestAnimationFrame` clears the attribute only after the flip has
 * painted once with transitions off. A flip within that window cancels the prior
 * pair first, so its own attribute isn't removed early by the stale one's.
 */
const setDarkClass = (dark: boolean) => {
  const html = document.documentElement
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
  if (pendingFrame2 !== null) cancelAnimationFrame(pendingFrame2)
  html.setAttribute('data-theme-switching', '')
  html.classList.toggle('dark', dark)
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame2 = requestAnimationFrame(() => {
      html.removeAttribute('data-theme-switching')
      pendingFrame = null
      pendingFrame2 = null
    })
  })
}

const notify = () => listeners.forEach((listener) => listener())

const handleSystemChange = (event: MediaQueryListEvent) => {
  if (readStoredMode() !== 'system') return
  const next: Mode = event.matches ? 'dark' : 'light'
  if (heldChoice !== null) {
    heldChoice = next
    notify()
    return
  }
  setDarkClass(next === 'dark')
  notify()
}

/** The one shared media query listener every `useMode` subscriber follows, ref-counted. */
let mediaQuery: MediaQueryList | null = null
let followerCount = 0

/** Keeps `.dark` on the OS's preference for as long as the stored choice stays `system`. */
const followSystem = () => {
  if (typeof window.matchMedia !== 'function') return () => {}
  if (followerCount === 0) {
    mediaQuery = window.matchMedia(MEDIA_QUERY)
    mediaQuery.addEventListener('change', handleSystemChange)
  }
  followerCount += 1
  return () => {
    followerCount -= 1
    if (followerCount === 0 && mediaQuery !== null) {
      mediaQuery.removeEventListener('change', handleSystemChange)
      mediaQuery = null
    }
  }
}

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  listeners.add(onChange)
  const stopFollowingSystem = followSystem()
  return () => {
    observer.disconnect()
    listeners.delete(onChange)
    stopFollowingSystem()
  }
}

/**
 * Sets the ground on `dark` until the returned release is called. A release
 * lifts only its own hold, once; while an older hold remains underneath, the
 * ground stays on that hold's own ground; when the last hold lifts, the ground
 * goes back to the person's mode as it stands then.
 */
const acquireHold = (dark: boolean): (() => void) => {
  const token = Symbol(dark ? 'ink hold' : 'paper hold')
  heldChoice ??= classMode()
  holds.push({ token, dark })
  setDarkClass(dark)
  notify()
  return () => {
    const index = holds.findIndex((hold) => hold.token === token)
    if (index === -1) return
    holds.splice(index, 1)
    const remaining = holds[holds.length - 1]
    if (remaining !== undefined) {
      setDarkClass(remaining.dark)
      notify()
      return
    }
    if (heldChoice === null) return
    const choice = heldChoice
    heldChoice = null
    setDarkClass(choice === 'dark')
    notify()
  }
}

/** Forces the ground on ink — `zen, on ink`. */
export const holdInkGround = (): (() => void) => acquireHold(true)

/** Forces the ground on paper — the new-pond sheet's theme preview. */
export const holdPaperGround = (): (() => void) => acquireHold(false)

/**
 * Sets `.dark` directly: a non-preview, non-persisted apply (switching into a
 * pond with its own theme). Never writes `localStorage`, never touches a hold's
 * baseline — it is not the person's choice and not a preview.
 */
export const setMode = (mode: Mode): void => {
  setDarkClass(mode === 'dark')
  notify()
}

export function useMode(): { mode: Mode; toggleMode: () => void } {
  const mode = useSyncExternalStore<Mode>(subscribe, readMode, () => 'light')
  const toggleMode = useCallback(() => {
    const next: Mode = readMode() === 'dark' ? 'light' : 'dark'
    explicitChoice = next
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      /* private mode: explicitChoice above still holds the pick for this visit */
    }
    if (heldChoice !== null) {
      heldChoice = next
      notify()
      return
    }
    setDarkClass(next === 'dark')
  }, [])
  return { mode, toggleMode }
}
