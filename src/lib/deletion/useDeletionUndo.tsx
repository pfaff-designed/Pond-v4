'use client'

/**
 * Shared undo-toast host for reversible deletions (ticket-27).
 *
 * ONE `DeletionUndoProvider` lives in the workspace layout's content row and
 * renders the single toast viewport (bottom-right of the content area, clear of
 * the AI terminal). Consumers (`Rail`, `DocumentPanel`) call
 * `useDeletionUndo()` for:
 *
 *  - `stageDeletion` — the caller has already removed the item optimistically;
 *    this opens an undo toast and defers `commit` behind a grace window via
 *    {@link scheduleDeferredCommit}. Undo cancels the pending write and runs
 *    `undo` — guarded by {@link performUndo} so a click that loses the race
 *    against the commit timer can never restore an item whose delete is already
 *    in flight. Dismiss / window-elapse flushes the write.
 *  - `notify` — a plain, auto-expiring notice toast (no Undo), e.g. for a
 *    failed delete.
 *  - `flushScope` — commit-and-clear every pending toast staged with a given
 *    `scope`. The editor uses this on page change so a block toast can never
 *    survive navigation and "undo" a block into the wrong page.
 *
 * See the crash-window caveat in deferred-commit.ts: deferral is client-side,
 * not durable soft-delete. On provider unmount all pending deletes are flushed
 * so a settled user action isn't silently resurrected.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  scheduleDeferredCommit,
  performUndo,
  type DeferredCommit,
  GRACE_WINDOW_MS,
} from '@/lib/deletion/deferred-commit'
import { UndoToast, UndoToastViewport } from '@/components/molecules/UndoToast'

export interface StageDeletionInput {
  /** Toast copy, e.g. `Deleted "Scratchpad"`. */
  message: string
  /** The irreversible write, run when the grace window closes without an undo. */
  commit: () => void | Promise<void>
  /** Restore the optimistically-removed item — run on Undo. Omit for a notice. */
  undo?: () => void | Promise<void>
  /** Optional secondary action shown alongside dismiss (e.g. navigate to the page). */
  action?: () => void
  /** Button label for the secondary action (default: "Open"). */
  actionLabel?: string
  /** Group tag for {@link DeletionUndoContextValue.flushScope}. */
  scope?: string
}

interface ActiveToast {
  id: string
  message: string
  controller: DeferredCommit
  restore?: () => void | Promise<void>
  /** Optional secondary action (e.g. "Open" navigation for accept receipts). */
  action?: () => void
  actionLabel?: string
  scope?: string
}

interface DeletionUndoContextValue {
  stageDeletion: (input: StageDeletionInput) => void
  /**
   * Show a plain auto-expiring notice toast. When `action` is provided, a
   * secondary button appears alongside the dismiss control — useful for
   * receipts that offer navigation (e.g. "Open" after an accept write).
   * The `actionLabel` controls the button copy (defaults to "Open").
   */
  notify: (message: string, action?: () => void, actionLabel?: string) => void
  /** Commit-and-clear every pending toast staged with this scope. */
  flushScope: (scope: string) => void
}

const DeletionUndoContext = createContext<DeletionUndoContextValue | null>(null)

export function DeletionUndoProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  // Live ref so the click/flush handlers see the current queue without
  // re-subscribing. Synced in an effect (never mutate a ref during render);
  // handlers only run on user events / cleanup, after the sync has landed.
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
        {
          id,
          message: input.message,
          controller,
          restore: input.undo,
          scope: input.scope,
          action: input.action,
          actionLabel: input.actionLabel,
        },
      ])
    },
    [remove]
  )

  const notify = useCallback(
    (message: string, action?: () => void, actionLabel?: string) => {
      stageDeletion({ message, commit: () => {}, action, actionLabel })
    },
    [stageDeletion]
  )

  const handleUndo = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((t) => t.id === id)
      remove(id)
      if (!toast?.restore) return
      // performUndo restores ONLY if the undo beat the commit timer — if the
      // write already fired, restoring would race the in-flight delete.
      performUndo(toast.controller, toast.restore)
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

  const flushScope = useCallback(
    (scope: string) => {
      for (const toast of toastsRef.current) {
        if (toast.scope !== scope) continue
        void toast.controller.flush()
        remove(toast.id)
      }
    },
    [remove]
  )

  // On unmount (leaving the workspace), flush any still-pending deletions so
  // they aren't silently dropped. A pending item was already removed from the
  // UI, so flushing honors the user's action rather than resurrecting it.
  useEffect(() => {
    return () => {
      for (const toast of toastsRef.current) {
        void toast.controller.flush()
      }
    }
  }, [])

  const value = useMemo(
    () => ({ stageDeletion, notify, flushScope }),
    [stageDeletion, notify, flushScope]
  )

  return (
    <DeletionUndoContext.Provider value={value}>
      {children}
      <UndoToastViewport>
        {toasts.map((toast) => (
          <UndoToast
            key={toast.id}
            message={toast.message}
            durationMs={GRACE_WINDOW_MS}
            onUndo={toast.restore ? () => handleUndo(toast.id) : undefined}
            onAction={toast.action}
            actionLabel={toast.actionLabel}
            onDismiss={() => handleDismiss(toast.id)}
          />
        ))}
      </UndoToastViewport>
    </DeletionUndoContext.Provider>
  )
}

export function useDeletionUndo(): DeletionUndoContextValue {
  const ctx = useContext(DeletionUndoContext)
  if (!ctx) throw new Error('useDeletionUndo must be used within a DeletionUndoProvider')
  return ctx
}
