'use client'

/**
 * The editor column's resize handle (#58) — a thin vertical strip on the
 * column's right edge. Dragging (pointer capture) or arrow-keying it adjusts
 * the column width; the parent owns the width state and persistence (via
 * useContentWidth), mirroring the TerminalDrawer handle's controlled contract:
 * clamped live changes through onWidthChange, a single gesture-end commit
 * through onWidthCommit.
 *
 * Because the column is centered (mx-auto), a right-edge drag of Δx grows the
 * width by 2Δx — half the growth goes to each side, which keeps the handle
 * tracking the cursor instead of falling behind at half speed.
 *
 * A11y: role="separator" with aria-valuenow/min/max (the ARIA pattern for a
 * window splitter), focusable, ←/→ (and ↓/↑) nudge by CONTENT_WIDTH_STEP,
 * Home/End jump to the bounds. Each keypress is a complete gesture, so it
 * commits immediately.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  CONTENT_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  CONTENT_WIDTH_STEP,
  clampContentWidth,
} from '@/lib/layout/content-width'

export interface ContentWidthHandleProps {
  /** Current column width in px (clamped by the parent's useContentWidth). */
  width: number
  /** Live width updates during a drag (clamped before delivery). */
  onWidthChange: (width: number) => void
  /** Fired once when a gesture ends — persist here, not per move. */
  onWidthCommit?: (width: number) => void
  /** Positioning within the column wrapper (e.g. absolute inset-y + right). */
  className?: string
}

export function ContentWidthHandle({
  width,
  onWidthChange,
  onWidthCommit,
  className,
}: ContentWidthHandleProps) {
  // Same pointer-capture drag state as TerminalDrawer: captured move/up/cancel
  // events reach the handle even off the thin strip, pointerId matching keeps a
  // second (multi-touch) pointer from jittering an in-flight drag, and
  // `lastWidth` is what a cancel/up commits — pointercancel can carry garbage
  // coordinates, so we never recompute from them.
  const dragState = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    lastWidth: number
  } | null>(null)

  const releaseBodyStyles = () => {
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }

  // If the editor unmounts mid-drag, don't leave the page stuck in ew-resize/no-select.
  useEffect(
    () => () => {
      if (dragState.current) releaseBodyStyles()
    },
    []
  )

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (dragState.current) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture can fail for already-released pointers; the drag still works while over the handle */
      }
      dragState.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startWidth: width,
        lastWidth: width,
      }
      // Kill text selection + show the resize cursor for the whole drag.
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ew-resize'
    },
    [width]
  )

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      if (!st || e.pointerId !== st.pointerId) return
      // 2× the delta: the centered column grows both ways, so the right edge
      // (and the handle under the cursor) moves by exactly the pointer delta.
      const next = clampContentWidth(st.startWidth + 2 * (e.clientX - st.startX))
      st.lastWidth = next
      onWidthChange(next)
    },
    [onWidthChange]
  )

  // Shared end for pointerup AND pointercancel (touch-scroll takeover, OS
  // interrupt): clear the drag, release body styles, commit the last width the
  // user actually saw.
  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      if (!st || e.pointerId !== st.pointerId) return
      dragState.current = null
      releaseBodyStyles()
      onWidthCommit?.(st.lastWidth)
    },
    [onWidthCommit]
  )

  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next: number | null = null
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = width + CONTENT_WIDTH_STEP
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = width - CONTENT_WIDTH_STEP
      else if (e.key === 'Home') next = CONTENT_MIN_WIDTH
      else if (e.key === 'End') next = CONTENT_MAX_WIDTH
      if (next === null) return
      e.preventDefault()
      const clamped = clampContentWidth(next)
      onWidthChange(clamped)
      onWidthCommit?.(clamped)
    },
    [width, onWidthChange, onWidthCommit]
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize page width"
      aria-valuenow={Math.round(width)}
      aria-valuemin={CONTENT_MIN_WIDTH}
      aria-valuemax={CONTENT_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={onHandlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onHandleKeyDown}
      className={`group w-4 cursor-ew-resize flex justify-center outline-none touch-none ${className ?? ''}`}
      data-testid="content-width-handle"
    >
      {/* The grip pill — the terminal drawer's affordance rotated vertical.
          Sticky so it stays in view while a long page scrolls under it; quiet
          until hover/focus, then the Press accent. */}
      <span className="sticky top-[45%] h-10 w-1 rounded-full bg-mn-text-secondary/40 group-hover:bg-mn-text group-focus:bg-mn-text transition-colors" />
    </div>
  )
}
