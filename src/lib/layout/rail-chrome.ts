'use client'

/**
 * Whether the rail is minimized. One store for the button, ⌘\ and the palette,
 * so the three can't disagree. Absent in storage means the rail is showing —
 * the choice is optional and a reload keeps it.
 */

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'pond:rail-minimized'

let minimized = false
let loaded = false
const listeners = new Set<() => void>()

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    minimized = window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    minimized = false
  }
}

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeRailChrome(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRailMinimized() {
  ensureLoaded()
  return minimized
}

export function setRailMinimized(next: boolean) {
  ensureLoaded()
  if (next === minimized) return
  minimized = next
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* the choice still holds for this tab */
  }
  emit()
}

export function toggleRail() {
  setRailMinimized(!getRailMinimized())
}

/** Server render shows the rail. The client snapshot corrects it after mount. */
export function useRailMinimized() {
  return useSyncExternalStore(subscribeRailChrome, getRailMinimized, () => false)
}
