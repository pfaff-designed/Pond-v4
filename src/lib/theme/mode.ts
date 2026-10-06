'use client'

/**
 * Light or dark — the one switch `PondCommand` carries at rest (`Pond 02` 2g,
 * `command-palette.md`: "a mode toggle sits beside the chip"). Dark is the
 * existing `.dark` role block in `globals.css`, applied to `<html>` so every
 * surface, portals included, reads it. The choice persists per browser, and
 * `mode-boot` re-applies it before first paint so a dark pond never flashes paper.
 */

import { useCallback, useSyncExternalStore } from 'react'

import { MODE_KEY } from './mode-boot'

export type Mode = 'light' | 'dark'

const readMode = (): Mode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

export function useMode(): { mode: Mode; toggleMode: () => void } {
  const mode = useSyncExternalStore<Mode>(subscribe, readMode, () => 'light')
  const toggleMode = useCallback(() => {
    const next: Mode = readMode() === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      /* private mode: the switch still holds for this visit */
    }
  }, [])
  return { mode, toggleMode }
}
