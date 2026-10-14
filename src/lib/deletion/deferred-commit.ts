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

/**
 * Why a commit is running (KAN-310, replaces the old module-global
 * `isFlushDrivenCommit` depth counter). `'flush-driven'` means ANOTHER
 * write's `flushStagedDeletes()` forced this commit out of the way ahead of
 * its own write — never the grace timer elapsing or the toast's own ×
 * dismiss, which pass no reason. Threaded through so `Rail.tsx`'s `withUser`
 * can decide, per call, whether to skip its own pages-query invalidate.
 */
export type CommitReason = 'flush-driven'

export interface DeferredCommitOptions {
  /** The irreversible write, run when the grace window closes without an undo. */
  commit: (reason?: CommitReason) => void | Promise<void>
  /** How long to hold the write before committing. Defaults to {@link GRACE_WINDOW_MS}. */
  graceMs?: number
  /** Injectable timers (jest passes fakes; the browser gets window.setTimeout). */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

export interface DeferredCommit {
  /** Cancel the pending write — the deletion is undone, nothing is persisted. */
  undo: () => void
  /**
   * Commit now, ahead of the window (e.g. the toast was dismissed). Idempotent:
   * a call after the commit has already started returns the SAME in-flight
   * promise rather than `undefined`, so a concurrent flush (KAN-273: a tree
   * write racing the grace-timer commit) still waits for the real write.
   * `reason` is forwarded to `commit` only on the FIRST call that actually
   * starts it — a later idempotent call returning the same in-flight promise
   * cannot retroactively change why that commit started.
   */
  flush: (reason?: CommitReason) => Promise<void>
  /** True once the write has run (via window elapse or flush). */
  readonly isSettled: boolean
  /** True if undo ran before the write — the deletion was reverted. */
  readonly isUndone: boolean
}

/**
 * Attempt an undo and run `restore` ONLY if the undo actually won — i.e. the
 * write hadn't already committed. Guards the race where the grace window fires
 * in the same beat as the user's Undo click: `controller.undo()` no-ops once
 * settled, and without this guard the restore would still run, racing the
 * in-flight destructive write. Returns whether the undo (and restore) happened.
 */
export function performUndo(
  controller: DeferredCommit,
  restore: () => void | Promise<void>
): boolean {
  controller.undo()
  if (!controller.isUndone) return false
  void restore()
  return true
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
  // The commit's own promise, kept so a `flush()` that lands after the commit
  // has already started (but before it finishes) can return the SAME
  // in-flight promise instead of `undefined` — see the `flush` doc above.
  let commitPromise: Promise<void> | null = null

  function runCommit(reason?: CommitReason): Promise<void> {
    if (undone) return Promise.resolve()
    if (settled) return commitPromise ?? Promise.resolve()
    settled = true
    if (handle !== null) {
      clearTimer(handle)
      handle = null
    }
    commitPromise = Promise.resolve(options.commit(reason))
    return commitPromise
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
    flush(reason) {
      return runCommit(reason)
    },
    get isSettled() {
      return settled
    },
    get isUndone() {
      return undone
    },
  }
}
