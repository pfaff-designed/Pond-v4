'use client'

/**
 * Host hook for reversible deletions with an undo toast (ticket-27).
 *
 * A caller stages a deletion with {@link stageDeletion}: it has already removed
 * the item optimistically (from local state or an optimistic cache), and passes
 * the `commit` (the real destructive write) plus the `undo` (restore) callback.
 * The hook opens an undo toast and defers `commit` behind a grace window via
 * {@link scheduleDeferredCommit}. Undo cancels the write and runs `undo`;
 * dismiss / window-elapse flushes the write.
 *
 * Returns the toast queue to render (via {@link UndoToastViewport}) and the
 * `stageDeletion` entry point. See the crash-window caveat in deferred-commit.ts:
 * this is client-side deferral, not durable soft-delete.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  scheduleDeferredCommit,
  type DeferredCommit,
  GRACE_WINDOW_MS,
} from '@/lib/deletion/deferred-commit'
import { UndoToast, UndoToastViewport } from '@/components/molecules/UndoToast'

export interface StageDeletionInput {
  /** Toast copy, e.g. `Deleted "Scratchpad"`. */
  message: string
  /** The irreversible write, run when the grace window closes without an undo. */
  commit: () => void | Promise<void>
  /** Restore the optimistically-removed item — run on Undo. */
  undo: () => void | Promise<void>
}

interface ActiveToast {
  id: string
  message: string
  controller: DeferredCommit
  restore: () => void | Promise<void>
}

export function useDeletionUndo() {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  // Live ref so the callbacks + unmount flush see the current queue without
  // re-subscribing. Synced in an effect (never mutate a ref during render).
  const toastsRef = useRef<ActiveToast[]>([])
  useEffect(() => {
    toastsRef.current = toasts
  }, [toasts])

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const stageDeletion = useCallback(
    (input: StageDeletionInput) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`

      const controller = scheduleDeferredCommit({
        commit: () => {
          remove(id)
          return input.commit()
        },
        graceMs: GRACE_WINDOW_MS,
      })

      setToasts((prev) => [
        ...prev,
        { id, message: input.message, controller, restore: input.undo },
      ])
    },
    [remove]
  )

  const handleUndo = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((t) => t.id === id)
      if (!toast) return
      toast.controller.undo()
      remove(id)
      void toast.restore()
    },
    [remove]
  )

  const handleDismiss = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((t) => t.id === id)
      if (!toast) return
      // Dismiss commits the deletion ahead of the window (flush also removes it).
      void toast.controller.flush()
      remove(id)
    },
    [remove]
  )

  // On unmount (e.g. route change), flush any still-pending deletions so they
  // aren't silently dropped. A pending item was already removed from the UI, so
  // flushing honors the user's action rather than resurrecting it.
  useEffect(() => {
    return () => {
      for (const toast of toastsRef.current) {
        void toast.controller.flush()
      }
    }
  }, [])

  const toastStack = (
    <UndoToastViewport>
      {toasts.map((toast) => (
        <UndoToast
          key={toast.id}
          message={toast.message}
          durationMs={GRACE_WINDOW_MS}
          onUndo={() => handleUndo(toast.id)}
          onDismiss={() => handleDismiss(toast.id)}
        />
      ))}
    </UndoToastViewport>
  )

  return { stageDeletion, toastStack }
}
