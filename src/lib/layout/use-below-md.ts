'use client'

import { useSyncExternalStore } from 'react'

/** Tailwind's `md` is 48rem; the DC's `size="mobile"` is everything under it. */
const QUERY = '(width < 48rem)'

const subscribe = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', notify)
  return () => list.removeEventListener('change', notify)
}

const getSnapshot = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches

const getServerSnapshot = () => false

/** Is the viewport below the `md` breakpoint? False on the server and where `matchMedia` is absent. */
export const useBelowMd = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
