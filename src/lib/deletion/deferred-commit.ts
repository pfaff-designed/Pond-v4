/**
 * Deferred-commit grace window (ticket-27, undo mechanics).
 *
 * A deletion the user should be able to *undo* is not written immediately.
 * Instead it is staged: the item disappears from the UI at once (optimistic),
 * an undo toast opens, and the real destructive write is deferred until either
 *   - the grace window (~6s) elapses, or
 *   - the toast is dismissed (× / a newer deletion pushing this one out),
 * whichever comes first. Undo cancels the pending write and restores the item.
 *
 * ⚠️ CRASH-WINDOW CAVEAT (honest, per the ticket): this is a *client-side*
 * deferred commit, not durable soft-delete. During the grace window the item is
 * gone from the UI but the DB row still exists; the destructive write only lands
 * when the window closes. If the tab is closed or crashes mid-window, the delete
 * simply never happens — the row survives and reappears on reload. That is safe
 * (nothing is lost), but it is NOT the durable trash/`deleted_at` model, which
 * stays DEFERRED to a later pass. See the ticket Resolution.
 *
 * Framework-agnostic and timer-injectable so jest can drive the window
 * deterministically. React hosts wrap this in a hook/component.
 */

export const GRACE_WINDOW_MS = 6000

export interface DeferredCommitOptions {
  /** The irreversible write, run when the grace window closes without an undo. */
  commit: () => void | Promise<void>
  /** How long to hold the write before committing. Defaults to {@link GRACE_WINDOW_MS}. */
  graceMs?: number
  /** Injectable timers (jest passes fakes; the browser gets window.setTimeout). */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

export interface DeferredCommit {
  /** Cancel the pending write — the deletion is undone, nothing is persisted. */
  undo: () => void
  /** Commit now, ahead of the window (e.g. the toast was dismissed). Idempotent. */
  flush: () => void | Promise<void>
  /** True once the write has run (via window elapse or flush). */
  readonly isSettled: boolean
  /** True if undo ran before the write — the deletion was reverted. */
  readonly isUndone: boolean
}

/**
 * Stage a deletion behind a grace window. The window starts immediately; the
 * caller is expected to have already removed the item from the UI optimistically.
 */
export function scheduleDeferredCommit(options: DeferredCommitOptions): DeferredCommit {
  const graceMs = options.graceMs ?? GRACE_WINDOW_MS
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))

  let settled = false
  let undone = false
  let handle: ReturnType<typeof setTimeout> | null = null

  function runCommit(): void | Promise<void> {
    if (settled || undone) return
    settled = true
    if (handle !== null) {
      clearTimer(handle)
      handle = null
    }
    return options.commit()
  }

  handle = setTimer(() => {
    handle = null
    void runCommit()
  }, graceMs)

  return {
    undo() {
      if (settled || undone) return
      undone = true
      if (handle !== null) {
        clearTimer(handle)
        handle = null
      }
    },
    flush() {
      return runCommit()
    },
    get isSettled() {
      return settled
    },
    get isUndone() {
      return undone
    },
  }
}
