'use client'

/**
 * The presentational shell for the AI terminal (ticket-24). Owns the drawer
 * ergonomics — collapse, user-resize with a drag handle, and remembered height —
 * so the AITerminal organism can stay focused on chat/proposal data.
 *
 * A flex *sibling* of the main panel (not an overlay): collapsing or shrinking it
 * hands the reclaimed height back to the content above, so the drawer never
 * covers what the user is reading.
 *
 * Height is controlled by the parent (persisted to localStorage there); this
 * molecule reports drag deltas and toggles via callbacks. Purely presentational
 * and prop-driven so its states are exercisable in Storybook.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const TERMINAL_MIN_HEIGHT = 160
export const TERMINAL_MAX_HEIGHT = 640
export const TERMINAL_DEFAULT_HEIGHT = 288 // 18rem — the incumbent fixed height
/** Header height shown when collapsed (just the grab/context strip). */
export const TERMINAL_COLLAPSED_HEIGHT = 40

export function clampTerminalHeight(h: number): number {
  return Math.min(TERMINAL_MAX_HEIGHT, Math.max(TERMINAL_MIN_HEIGHT, h))
}

export interface TerminalDrawerProps {
  /** Context label shown in the header strip (e.g. the open page name). */
  contextLabel: string
  /** Body height in px when expanded (excludes the header strip). */
  height: number
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Live height updates during a resize gesture (clamped before delivery). */
  onHeightChange: (height: number) => void
  /** Fired once when a resize gesture ends — persist here, not per move. */
  onHeightCommit?: (height: number) => void
  /** Wired to the existing /clear behavior — a visible affordance, not just placeholder text. */
  onClear: () => void
  /** The transcript / proposal region. */
  children: ReactNode
  /** The input row (textarea + send). */
  footer: ReactNode
  /** True while there is any transcript to clear (disables the Clear control when empty). */
  canClear?: boolean
}

export function TerminalDrawer({
  contextLabel,
  height,
  collapsed,
  onToggleCollapsed,
  onHeightChange,
  onHeightCommit,
  onClear,
  children,
  footer,
  canClear = true,
}: TerminalDrawerProps) {
  // Drag-to-resize via pointer capture on the handle: captured move/up/cancel
  // events are routed to the handle even when the cursor leaves the thin strip,
  // and pointerId matching keeps a second pointer (multi-touch) from jittering
  // an in-flight drag. `lastHeight` is what a cancel/up commits — pointercancel
  // events can carry garbage coordinates, so we never recompute from them.
  const dragState = useRef<{
    pointerId: number
    startY: number
    startHeight: number
    lastHeight: number
  } | null>(null)

  const releaseBodyStyles = () => {
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }

  // If the drawer unmounts mid-drag, don't leave the page stuck in ns-resize/no-select.
  useEffect(
    () => () => {
      if (dragState.current) releaseBodyStyles()
    },
    []
  )

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed || dragState.current) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture can fail for already-released pointers; the drag still works while over the handle */
      }
      dragState.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: height,
        lastHeight: height,
      }
      // Kill text selection + show the resize cursor for the whole drag.
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'
    },
    [collapsed, height]
  )

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      if (!st || e.pointerId !== st.pointerId) return
      // Drag up (negative deltaY) grows the drawer.
      const next = clampTerminalHeight(st.startHeight + (st.startY - e.clientY))
      st.lastHeight = next
      onHeightChange(next)
    },
    [onHeightChange]
  )

  // Shared end for pointerup AND pointercancel (touch-scroll takeover, OS
  // interrupt): clear the drag, release body styles, commit the last height the
  // user actually saw.
  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      if (!st || e.pointerId !== st.pointerId) return
      dragState.current = null
      releaseBodyStyles()
      onHeightCommit?.(st.lastHeight)
    },
    [onHeightCommit]
  )

  // Keyboard resize on the handle for accessibility (↑/↓ nudge by 24px). Each
  // press is a complete gesture, so it commits immediately.
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (collapsed) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = clampTerminalHeight(height + (e.key === 'ArrowUp' ? 24 : -24))
        onHeightChange(next)
        onHeightCommit?.(next)
      }
    },
    [collapsed, height, onHeightChange, onHeightCommit]
  )

  return (
    <section
      className="flex flex-col border-t border-border bg-card flex-shrink-0"
      style={{ height: collapsed ? TERMINAL_COLLAPSED_HEIGHT : height + TERMINAL_COLLAPSED_HEIGHT }}
      aria-label="Pond terminal"
    >
      {/* Resize handle — a thin grabbable strip along the top edge (hidden when collapsed). */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal"
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
          className="group h-1.5 -mt-1 cursor-ns-resize flex items-center justify-center outline-none touch-none"
          data-testid="terminal-resize-handle"
        >
          <span className="h-0.5 w-8 rounded-full bg-press-faint/60 group-hover:bg-press-accent group-focus:bg-press-accent transition-colors" />
        </div>
      )}

      {/* Header: context + visible controls (collapse toggle, clear). The context
          label carries the correspondence serif (ticket-32) so the strip reads as
          the head of a letter, not a console status bar; the Clear control stays a
          quiet lower-case affordance. */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-press-hair bg-press-accent-wash text-xs text-press-muted flex-shrink-0">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
        >
          <span
            aria-hidden
            className="inline-block text-[10px] transition-transform"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
          >
            ▾
          </span>
          <span className="font-serif italic">
            Context: <span className="not-italic font-medium text-foreground">{contextLabel}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          aria-label="Clear conversation"
          title="Clear conversation (/clear)"
          className="font-serif italic text-press-faint hover:text-press-rust transition-colors disabled:opacity-30 disabled:cursor-default cursor-pointer"
        >
          Clear
        </button>
      </div>

      {/* Body + footer collapse away, but the header strip stays as the re-open affordance. */}
      {!collapsed && (
        <>
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          <div className="flex-shrink-0">{footer}</div>
        </>
      )}
    </section>
  )
}
