'use client'

/**
 * Pointer-drag for bucketed views (#19) — the machinery a board or an agenda
 * calendar shares to drag a row card from one lane to another.
 *
 * Extracted from the board renderer (originally ported from the kanban view, F4)
 * the moment a second consumer appeared: the calendar drags cards between date
 * lanes exactly as the board drags them between option columns. Only the *drop
 * meaning* differs — the board writes an option id, the calendar writes a date — so
 * the hook is agnostic: it hit-tests registered buckets by DOM rect and hands the
 * consumer the dropped `(rowId, bucketKey)`; the consumer maps the key to the value
 * to persist.
 *
 * Drag lives in refs (one pointer-event burst, no re-render between moves); React
 * state only drives the lift visuals (the dragged card's dimming + the over-lane
 * highlight). Below a small threshold the gesture is treated as a click, not a drag.
 */

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** Below this pointer travel (px, Manhattan) a press is a click, not a drag. */
const DRAG_THRESHOLD = 4

/** The dragged card's own dim, shared by every bucketed drag surface (board, calendar). */
export const DRAG_LIFT_CLASS = 'opacity-30'
/** The bucket under the pointer during an active drag, shared the same way. */
export const DRAG_OVER_CLASS = 'bg-mn-text/[0.08]'
/**
 * Applied to the container while a drag is active, so the browser's native text
 * selection never runs alongside the drag (which `BlockCanvas` would otherwise read
 * as a text selection and pop its formatting toolbar over the cards). The gantt's
 * own hook draws this inline per-consumer; here it's the hook's own job so neither
 * bucketed consumer (board, calendar) can forget it.
 */
export const DRAG_ACTIVE_CLASS = 'select-none'

/**
 * Chrome anchors a native text selection at mousedown, before any drag
 * threshold is reached, so the press itself must cancel it. A cancelled
 * press also skips the browser's own focus and selection-collapse, so both
 * are done by hand.
 */
function preventNativeSelection(e: ReactPointerEvent) {
  e.preventDefault()
  window.getSelection()?.removeAllRanges()
  ;(e.currentTarget as HTMLElement).focus({ preventScroll: true })
}

export interface BucketDragState {
  rowId: string
  /** Current pointer position (for the floating clone). */
  x: number
  y: number
  /** Grab offset within the card, so the clone tracks under the cursor naturally. */
  dx: number
  dy: number
  /** True once travel passes the threshold — before that it's still a candidate click. */
  active: boolean
}

export interface PointerBucketDrag {
  /** The live drag, or null when idle. `active` gates the lift visuals. */
  drag: BucketDragState | null
  /** The bucket key currently under the pointer (for the drop-target highlight). */
  overKey: string | null
  /** Ref callback registering a bucket element under `key` for hit-testing. */
  registerBucket: (key: string) => (el: HTMLElement | null) => void
  /** Attach to each card's drag handle `onPointerDown`. */
  onCardPointerDown: (e: ReactPointerEvent, rowId: string) => void
  /** `DRAG_ACTIVE_CLASS` while a drag is active, else `undefined` — spread onto the
   *  same container as `containerHandlers`. */
  containerClassName: string | undefined
  /**
   * True from the end of a drag until the click the browser fires after it has been
   * delivered. A drag that ends over its own card still clicks it; that click is the
   * drag's, not a selection.
   */
  isClickSuppressed: () => boolean
  /** Spread onto the scroll container that wraps all buckets. */
  containerHandlers: {
    onPointerMove?: (e: ReactPointerEvent) => void
    onPointerUp?: () => void
    onPointerCancel?: () => void
    onPointerLeave?: () => void
  }
}

export function usePointerBucketDrag({
  editable,
  onDrop,
}: {
  editable: boolean
  /** Called on a completed drag onto a bucket. The consumer maps `bucketKey` → value. */
  onDrop: (rowId: string, bucketKey: string) => void
}): PointerBucketDrag {
  const [drag, setDrag] = useState<BucketDragState | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const bucketRefs = useRef(new Map<string, HTMLElement>())
  const dragRef = useRef<BucketDragState | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const overKeyRef = useRef<string | null>(null)
  const clickSuppressedRef = useRef(false)

  function bucketAt(x: number, y: number): string | null {
    for (const [key, el] of bucketRefs.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key
    }
    return null
  }

  function onCardPointerDown(e: ReactPointerEvent, rowId: string) {
    if (!editable) return
    // A press on a button or link inside the card (the open-add button, a title
    // link) is that control's own gesture, never the card's drag handle.
    if (e.target instanceof Element && e.target.closest('button, a')) return
    // A press on an editable field (the card-title input) still arms a candidate
    // drag like the rest of the card — but skips the selection guard, which would
    // otherwise preventDefault and steal the field's native focus/caret.
    const isEditableField =
      e.target instanceof Element &&
      !!e.target.closest('input, textarea, select, [contenteditable="true"]')
    if (!isEditableField) preventNativeSelection(e)
    clickSuppressedRef.current = false
    const li = (e.currentTarget as HTMLElement).closest('li') as HTMLElement | null
    const rect = (li ?? (e.currentTarget as HTMLElement)).getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY }
    const next: BucketDragState = {
      rowId,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      active: false,
    }
    dragRef.current = next
    setDrag(next)
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current
    if (!d || !startRef.current) return
    const moved =
      Math.abs(e.clientX - startRef.current.x) + Math.abs(e.clientY - startRef.current.y)
    const active = d.active || moved > DRAG_THRESHOLD
    // Belt-and-suspenders for a gesture the press-time guard didn't cancel
    // (a touch, a browser that ignored preventDefault).
    if (active && !d.active) window.getSelection()?.removeAllRanges()
    const next: BucketDragState = { ...d, x: e.clientX, y: e.clientY, active }
    dragRef.current = next
    setDrag(next)
    if (active) {
      const over = bucketAt(e.clientX, e.clientY)
      overKeyRef.current = over
      setOverKey(over)
    }
  }

  function endDrag(drop: boolean) {
    const d = dragRef.current
    const key = overKeyRef.current
    if (drop && d?.active && key) onDrop(d.rowId, key)
    if (d?.active) {
      // The click follows the pointerup in the same turn; the next turn is a fresh gesture.
      clickSuppressedRef.current = true
      setTimeout(() => {
        clickSuppressedRef.current = false
      }, 0)
    }
    dragRef.current = null
    startRef.current = null
    overKeyRef.current = null
    setDrag(null)
    setOverKey(null)
  }

  const handlePointerUp = () => endDrag(true)
  const handlePointerCancel = () => endDrag(false)
  // The pointer leaving the container (off a grid/board edge) gets no further
  // pointermove, so the stale `overKey` from the last move inside would otherwise
  // still read as a drop target. Leaving always cancels, never drops.
  const handlePointerLeave = () => endDrag(false)

  const registerBucket = (key: string) => (el: HTMLElement | null) => {
    if (el) bucketRefs.current.set(key, el)
    else bucketRefs.current.delete(key)
  }

  return {
    drag,
    overKey,
    registerBucket,
    onCardPointerDown,
    containerClassName: drag?.active ? DRAG_ACTIVE_CLASS : undefined,
    isClickSuppressed: () => clickSuppressedRef.current,
    containerHandlers: editable
      ? {
          onPointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerCancel,
          onPointerLeave: drag ? handlePointerLeave : undefined,
        }
      : {},
  }
}
