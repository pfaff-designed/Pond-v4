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
 *  - `stageUndo` — the caller has already applied a change and there is no
 *    write left to defer; the toast only offers `undo` for the window.
 *  - `notify` — a plain, auto-expiring notice toast (no Undo), e.g. for a
 *    failed delete.
 *  - `flushScope` — commit-and-clear every pending toast staged with a given
 *    `scope`. The editor uses this on page change so a block toast can never
 *    survive navigation and "undo" a block into the wrong page.
 *  - `flushStagedDeletes` — commit-and-clear every pending *tree deletion*
 *    toast (one staged via `stageDeletion` with a backstop `id`), regardless
 *    of scope, and await the commits (KAN-273). A tree write that reads
 *    sibling state (create, move, rename) calls this first so it never sees a
 *    row that is mid-delete. A `stageUndo` toast (no backstop id — a block
 *    edit, not a tree delete) is left alone.
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
import { stageId, unstageId, registerStagedFlush } from '@/lib/deletion/staged-ids'
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
  /**
   * Backstop id (KAN-300): staged via `stageId` on stage, cleared via
   * `unstageId` once the write commits or is undone, so a reload left with
   * no in-flight toast can still finish the delete (see staged-ids.ts).
   */
  id?: string
}

export interface StageUndoInput {
  /** Toast copy, e.g. `Turned into a list`. */
  message: string
  /** Put the change back — run on Undo. */
  undo: () => void | Promise<void>
  /** Group tag for {@link DeletionUndoContextValue.flushScope}. */
  scope?: string
}

type StageInput = Omit<StageDeletionInput, 'commit'> & Partial<Pick<StageDeletionInput, 'commit'>>

interface ActiveToast {
  id: string
  message: string
  controller: DeferredCommit
  restore?: () => void | Promise<void>
  /** Optional secondary action (e.g. "Open" navigation for accept receipts). */
  action?: () => void
  actionLabel?: string
  scope?: string
  /** Backstop id to unstage once this toast settles (commit or undo). */
  backstopId?: string
}

interface DeletionUndoContextValue {
  stageDeletion: (input: StageDeletionInput) => void
  stageUndo: (input: StageUndoInput) => void
  /**
   * Show a plain auto-expiring notice toast. When `action` is provided, a
   * secondary button appears alongside the dismiss control — useful for
   * receipts that offer navigation (e.g. "Open" after an accept write).
   * The `actionLabel` controls the button copy (defaults to "Open").
   */
  notify: (message: string, action?: () => void, actionLabel?: string) => void
  /** Commit-and-clear every pending toast staged with this scope. */
  flushScope: (scope: string) => void
  /**
   * Commit-and-clear every pending staged deletion (any scope), and await
   * every commit. Unlike `flushScope`, a toast staged via `stageUndo` (no
   * backstop id) is untouched — only real tree deletions are forced.
   */
  flushStagedDeletes: () => Promise<void>
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

  const stage = useCallback(
    (input: StageInput) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`

      if (input.id) stageId(input.id)

      const controller = scheduleDeferredCommit({
        commit: () => {
          remove(id)
          const result = input.commit?.()
          const backstopId = input.id
          if (!backstopId) return result
          // Unstage only once the write settles (not before it starts) — a
          // pagehide that flushes this ahead of a reload must leave the
          // backstop id in place until the request actually lands, so a
          // cancelled request still has the id for the reload sweep to
          // retry. Unstage on failure too: the caller's own restore path
          // (e.g. Rail's commitDelete) puts the row back, and a still-staged
          // id would keep filtering a row that is visible again.
          return Promise.resolve(result).finally(() => unstageId(backstopId))
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
          backstopId: input.id,
        },
      ])
    },
    [remove]
  )

  const stageDeletion = useCallback((input: StageDeletionInput) => stage(input), [stage])

  const stageUndo = useCallback(
    ({ message, undo, scope }: StageUndoInput) => stage({ message, undo, scope }),
    [stage]
  )

  const notify = useCallback(
    (message: string, action?: () => void, actionLabel?: string) => {
      stage({ message, action, actionLabel })
    },
    [stage]
  )

  const handleUndo = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((t) => t.id === id)
      remove(id)
      if (!toast?.restore) return
      // performUndo restores ONLY if the undo beat the commit timer — if the
      // write already fired, restoring would race the in-flight delete.
      const restored = performUndo(toast.controller, toast.restore)
      if (restored && toast.backstopId) unstageId(toast.backstopId)
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

  const flushStagedDeletes = useCallback(() => {
    const pending = toastsRef.current.filter((toast) => toast.backstopId)
    // allSettled, not all: one commit rejecting (a failed delete) must not
    // reject the flush itself and block the write that triggered it.
    return Promise.allSettled(
      pending.map((toast) => {
        remove(toast.id)
        return Promise.resolve(toast.controller.flush())
      })
    ).then(() => undefined)
  }, [remove])

  // Registered with the shared, React-free layer (KAN-273) so a page-tree
  // write anywhere (src/lib/pages/client.ts) can commit every staged deletion
  // first, without importing this hook — only one `DeletionUndoProvider` is
  // ever mounted, so there is exactly one flusher to register/unregister.
  useEffect(() => registerStagedFlush(flushStagedDeletes), [flushStagedDeletes])

  // Flush every pending toast's commit without waiting for the grace window —
  // shared by the unmount cleanup and the `pagehide` listener below. A pending
  // item was already removed from the UI, so flushing honors the user's action
  // rather than resurrecting it.
  const flushAll = useCallback(() => {
    for (const toast of toastsRef.current) {
      void toast.controller.flush()
    }
  }, [])

  // On unmount (leaving the workspace) and on `pagehide` (reload/close before
  // unmount would otherwise run — KAN-300), flush any still-pending deletions
  // so a navigation or reload can't resurrect a staged delete.
  useEffect(() => {
    window.addEventListener('pagehide', flushAll)
    return () => {
      window.removeEventListener('pagehide', flushAll)
      flushAll()
    }
  }, [flushAll])

  const value = useMemo(
    () => ({ stageDeletion, stageUndo, notify, flushScope, flushStagedDeletes }),
    [stageDeletion, stageUndo, notify, flushScope, flushStagedDeletes]
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

/**
 * Non-throwing variant for a module view that may render BELOW the provider
 * (`BlockCanvas`) or ABOVE it (a diff/proposal preview, a Storybook story) — not
 * every host that mounts a module is inside `DeletionUndoProvider`.
 */
export function useOptionalDeletionUndo(): DeletionUndoContextValue | null {
  return useContext(DeletionUndoContext)
}
