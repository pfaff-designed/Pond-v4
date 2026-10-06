'use client'

/**
 * The undo toast (ticket-27) — the snackbar shown after a reversible deletion
 * (a leaf page or an editor block). It states what was
 * removed and offers an Undo action for a grace window; on dismiss (or window
 * elapse, driven by the host) the deletion is committed.
 *
 * Purely presentational: the deferred-commit timing, the queue, and the actual
 * write live in the host (see useDeletionUndo). This molecule renders one toast
 * and raises Undo / Dismiss as callbacks. A thin progress bar telegraphs the
 * closing grace window when a duration is supplied. Omitting `onUndo` renders a
 * plain notice (e.g. "Couldn't delete …") with only the dismiss affordance.
 */

export interface UndoToastProps {
  /** The removed thing, e.g. `Deleted "Scratchpad"` or `Deleted text block`. */
  message: string
  /** Omit for a plain (non-undoable) notice — the Undo button is hidden. */
  onUndo?: () => void
  onDismiss: () => void
  /**
   * Grace window in ms — drives the countdown progress bar. Omit for a static
   * bar (the host still owns the actual timer; this is purely the visual).
   */
  durationMs?: number
  /**
   * Fix-1 (F1a+F12): an optional secondary action alongside the dismiss control —
   * e.g. "Open" after an accept write to navigate to the target page. Rendered as
   * a labeled button so accept receipts can offer navigation without abusing "Undo".
   */
  onAction?: () => void
  /** Button label for the secondary action (default "Open"). */
  actionLabel?: string
}

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs,
  onAction,
  actionLabel = 'Open',
}: UndoToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="motion-toast pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-mn-card bg-mn-text px-4 py-2.5 text-sm text-mn-surface shadow-mn-lg"
    >
      <span className="truncate">{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="ml-1 flex-shrink-0 rounded-mn-chrome px-2 py-0.5 font-medium text-mn-surface underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-mn-surface/60"
        >
          Undo
        </button>
      )}
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex-shrink-0 rounded-mn-chrome px-2 py-0.5 font-medium text-mn-surface underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-mn-surface/60"
        >
          {actionLabel}
        </button>
      )}
      {/* Fixed square + grid centering so the ✕ glyph sits optically centered on
          both axes (#60) — a bare inline button leaves the glyph's line box
          floating off-center. Same house pattern as the rail-row
          CRUD / BlockCanvas ×. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-mn-chrome leading-none text-mn-surface/50 outline-none hover:text-mn-surface focus-visible:ring-2 focus-visible:ring-mn-surface/60"
      >
        ✕
      </button>

      {durationMs !== undefined && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-mn-surface/40"
          style={{
            animation: `undo-toast-countdown ${durationMs}ms linear forwards`,
          }}
        />
      )}
    </div>
  )
}

/**
 * The stack for active toasts — TOP-right of its nearest `relative` ancestor.
 * There must be exactly ONE viewport (the DeletionUndoProvider renders it inside
 * the workspace's content row). Top-right keeps receipts in the eye-line and
 * clear of the AI terminal at the bottom. Kept separate so the toast itself
 * stays layout-free.
 */
export function UndoToastViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-4 right-4 z-40 flex flex-col items-end gap-2">
      {children}
    </div>
  )
}
