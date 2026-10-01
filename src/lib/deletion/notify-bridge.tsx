'use client'

/**
 * Notify bridge (Fix-1 / F12) — lets components OUTSIDE the DeletionUndoProvider
 * (the AITerminal lives below the provider's content row in the app layout) fire
 * receipt toasts into the provider's single viewport.
 *
 * Mirrors the FOCUS_TERMINAL_EVENT pattern (ShellCommands → terminal): the caller
 * dispatches a window CustomEvent via {@link requestNotify}; the {@link NotifyBridge}
 * component — mounted INSIDE the provider — listens and relays to `notify()`.
 * The toast then renders in the existing viewport, bottom-right of the content
 * row, clear of the terminal drawer as designed (ticket-27).
 */

import { useEffect } from 'react'
import { useDeletionUndo } from './useDeletionUndo'

export const NOTIFY_EVENT = 'pond:notify'

export interface NotifyDetail {
  message: string
  /** Optional secondary action button (e.g. "Open" → navigate to the page). */
  action?: () => void
  /** Label for the action button (defaults to "Open" in the toast). */
  actionLabel?: string
}

/** Fire a notice toast from anywhere — relayed to the provider's viewport. */
export function requestNotify(detail: NotifyDetail) {
  window.dispatchEvent(new CustomEvent<NotifyDetail>(NOTIFY_EVENT, { detail }))
}

/** Mount once inside DeletionUndoProvider (renders nothing). */
export function NotifyBridge() {
  const { notify } = useDeletionUndo()
  useEffect(() => {
    function onNotify(e: Event) {
      const detail = (e as CustomEvent<NotifyDetail>).detail
      if (detail?.message) notify(detail.message, detail.action, detail.actionLabel)
    }
    window.addEventListener(NOTIFY_EVENT, onNotify)
    return () => window.removeEventListener(NOTIFY_EVENT, onNotify)
  }, [notify])
  return null
}
