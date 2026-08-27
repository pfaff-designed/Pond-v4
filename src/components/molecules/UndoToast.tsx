'use client'

/**
 * The undo toast (ticket-27) — a Press-aesthetic snackbar shown after a
 * reversible deletion (a leaf page or an editor block). It states what was
 * removed and offers an Undo action for a grace window; on dismiss (or window
 * elapse, driven by the host) the deletion is committed.
 *
 * Purely presentational: the deferred-commit timing, the queue, and the actual
 * write live in the host (see useDeletionUndo). This molecule renders one toast
 * and raises Undo / Dismiss as callbacks. A thin progress bar telegraphs the
 * closing grace window when a duration is supplied.
 */

export interface UndoToastProps {
  /** The removed thing, e.g. `Deleted "Scratchpad"` or `Deleted text block`. */
  message: string
  onUndo: () => void
  onDismiss: () => void
  /**
   * Grace window in ms — drives the countdown progress bar. Omit for a static
   * bar (the host still owns the actual timer; this is purely the visual).
   */
  durationMs?: number
}

export function UndoToast({ message, onUndo, onDismiss, durationMs }: UndoToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-xl border border-press-line bg-press-ink px-4 py-2.5 text-sm text-press-paper shadow-2xl"
    >
      <span className="truncate">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="ml-1 flex-shrink-0 rounded-md px-2 py-0.5 font-medium text-press-paper underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-press-paper/60"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 rounded-md px-1 leading-none text-press-paper/50 outline-none hover:text-press-paper focus-visible:ring-2 focus-visible:ring-press-paper/60"
      >
        ✕
      </button>

      {durationMs !== undefined && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-press-paper/40"
          style={{
            animation: `undo-toast-countdown ${durationMs}ms linear forwards`,
          }}
        />
      )}
    </div>
  )
}

/**
 * A fixed-position stack for the active toasts (bottom-center). The host renders
 * its toast queue as children. Kept separate so the toast itself stays layout-free
 * and easy to place in Storybook.
 */
export function UndoToastViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {children}
    </div>
  )
}
