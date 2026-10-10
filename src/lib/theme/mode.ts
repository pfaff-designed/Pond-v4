'use client'

/**
 * Light or dark — the one switch `PondCommand` carries at rest (`Pond 02` 2g,
 * `command-palette.md`: "a mode toggle sits beside the chip"). Dark is the
 * existing `.dark` role block in `globals.css`, applied to `<html>` so every
 * surface, portals included, reads it. The choice persists per browser, and
 * `mode-boot` re-applies it before first paint so a dark pond never flashes paper.
 *
 * The ink ground can also be HELD for a while — `zen, on ink` (`Pond 06.17` 6q
 * frame 10) sets the page on ink whatever the person chose. A hold is not a
 * choice: it is never stored, `useMode` keeps reporting and toggling the person's
 * own mode beneath it, and when the last hold lifts that choice is what applies.
 * After boot, this module is the only writer of the `.dark` class.
 */

import { useCallback, useSyncExternalStore } from 'react'

import { MODE_KEY } from './mode-boot'

export type Mode = 'light' | 'dark'

/** Who holds the ink ground now — each hold is its own token. */
const holds = new Set<symbol>()
/** The person's mode while the ink ground is held; null when nothing holds it. */
let heldChoice: Mode | null = null
const listeners = new Set<() => void>()

const classMode = (): Mode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

const readMode = (): Mode => heldChoice ?? classMode()

const setDarkClass = (dark: boolean) => document.documentElement.classList.toggle('dark', dark)

const notify = () => listeners.forEach((listener) => listener())

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  listeners.add(onChange)
  return () => {
    observer.disconnect()
    listeners.delete(onChange)
  }
}

/**
 * Sets the ground on ink until the returned release is called. A release lifts
 * only its own hold, once; when the last hold lifts, the ground goes back to the
 * person's mode as it stands then.
 */
export const holdInkGround = (): (() => void) => {
  const hold = Symbol('ink hold')
  heldChoice ??= classMode()
  holds.add(hold)
  setDarkClass(true)
  notify()
  return () => {
    if (!holds.delete(hold) || holds.size > 0 || heldChoice === null) return
    const choice = heldChoice
    heldChoice = null
    setDarkClass(choice === 'dark')
    notify()
  }
}

export function useMode(): { mode: Mode; toggleMode: () => void } {
  const mode = useSyncExternalStore<Mode>(subscribe, readMode, () => 'light')
  const toggleMode = useCallback(() => {
    const next: Mode = readMode() === 'dark' ? 'light' : 'dark'
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      /* private mode: the switch still holds for this visit */
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
