'use client'

/**
 * Pointer-drag for gantt bars (#27 fast-follow) — reschedule by dragging, the
 * continuous cousin of `use-pointer-bucket-drag`. Where the board/calendar hook
 * hit-tests discrete drop buckets, this one maps horizontal pixel travel to a
 * whole-day delta over the timeline and previews the moved bar live.
 *
 * Three gestures share the hook, distinguished by the `mode` captured at pointer-down:
 * dragging the bar body MOVES it (start+end together); dragging an edge RESIZES that
 * end alone. The px→day conversion and the clamp/milestone rules live in the pure
 * `pixelsToDays` / `shiftBar` (apply.ts) — this hook is only the pointer machinery.
 *
 * The axis stays frozen during a drag with no extra bookkeeping: the shift is
 * previewed locally and only written on pointer-up (`onCommit`), so the row data
 * `layoutGanttBars` reads is unchanged mid-gesture and the timeline can't reflow under
 * the pointer. The track width + span are snapshotted at pointer-down so the px→day
 * ratio is stable even across an unrelated re-render.
 *
 * Drag lives in refs (one pointer-event burst, no re-render between moves); React
 * state only drives the previewed bar. Below a small threshold the press is a click.
 */

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { pixelsToDays, shiftBar, type BarDates, type BarShift, type ShiftMode } from './apply'

/** Below this pointer travel (px) a press is a click, not a drag. */
const DRAG_THRESHOLD = 4

/** The live drag, resolved to the bar's previewed display dates. */
export interface GanttDragState {
  rowId: string
  mode: ShiftMode
  /** True once travel passes the threshold — before that it's still a candidate click. */
  active: boolean
  /** The previewed start day to draw the dragged bar at (over the frozen axis). */
  startIso: string
  /** The previewed end day — equals `startIso` for a milestone/single-day tick. */
  endIso: string
}

/** What the pointer-down captured for the duration of one gesture (frozen). */
interface DragSession {
  rowId: string
  mode: ShiftMode
  startX: number
  dates: BarDates
  trackWidthPx: number
  totalDays: number
  /** The latest shift this gesture would persist — the exact thing committed on drop. */
  shift: BarShift
  active: boolean
}

export interface PointerGanttDrag {
  /** The live drag, or null when idle. `active` gates the preview. */
  drag: GanttDragState | null
  /**
   * Attach to a bar's grab zone `onPointerDown`. `mode` is which part was grabbed;
   * `dates` are the row's stored dates (endIso null = milestone). The track element is
   * found via the nearest `[data-gantt-track]` ancestor and measured for the px→day ratio.
   */
  onBarPointerDown: (e: ReactPointerEvent, rowId: string, mode: ShiftMode, dates: BarDates) => void
  /** Spread onto the container that wraps the bars. */
  containerHandlers: {
    onPointerMove?: (e: ReactPointerEvent) => void
    onPointerUp?: () => void
    onPointerLeave?: () => void
  }
}

/** The previewed display dates for a bar given the shift this gesture computed. */
function displayDates(dates: BarDates, shift: BarShift): { startIso: string; endIso: string } {
  const startIso = shift.startIso ?? dates.startIso
  // A milestone/single-date row (stored endIso null) draws as a tick at its start —
  // unless a resize-end created an end this gesture.
  const endIso = dates.endIso === null ? (shift.endIso ?? startIso) : (shift.endIso ?? dates.endIso)
  return { startIso, endIso }
}

export function usePointerGanttDrag({
  editable,
  totalDays,
  onCommit,
}: {
  editable: boolean
  /** The timeline's current inclusive day span — snapshotted at pointer-down. */
  totalDays: number
  /** Called on pointer-up with the changed date fields (empty shifts are skipped). */
  onCommit: (rowId: string, shift: BarShift) => void
}): PointerGanttDrag {
  const [drag, setDrag] = useState<GanttDragState | null>(null)
  const sessionRef = useRef<DragSession | null>(null)

  function reflect(s: DragSession) {
    const { startIso, endIso } = displayDates(s.dates, s.shift)
    setDrag({ rowId: s.rowId, mode: s.mode, active: s.active, startIso, endIso })
  }

  function onBarPointerDown(e: ReactPointerEvent, rowId: string, mode: ShiftMode, dates: BarDates) {
    if (!editable) return
    const track = (e.currentTarget as HTMLElement).closest(
      '[data-gantt-track]'
    ) as HTMLElement | null
    const trackWidthPx = track?.getBoundingClientRect().width ?? 0
    e.stopPropagation() // an edge grab must not also read as a body (move) grab
    const s: DragSession = {
      rowId,
      mode,
      startX: e.clientX,
      dates,
      trackWidthPx,
      totalDays,
      shift: {},
      active: false,
    }
    sessionRef.current = s
    reflect(s)
  }

  function onPointerMove(e: ReactPointerEvent) {
    const s = sessionRef.current
    if (!s) return
    const deltaPx = e.clientX - s.startX
    s.active = s.active || Math.abs(deltaPx) > DRAG_THRESHOLD
    s.shift = shiftBar(s.dates, s.mode, pixelsToDays(deltaPx, s.trackWidthPx, s.totalDays))
    reflect(s)
  }

  function onPointerUp() {
    const s = sessionRef.current
    if (s?.active && (s.shift.startIso !== undefined || s.shift.endIso !== undefined)) {
      onCommit(s.rowId, s.shift)
    }
    sessionRef.current = null
    setDrag(null)
  }

  return {
    drag,
    onBarPointerDown,
    containerHandlers: editable
      ? { onPointerMove, onPointerUp, onPointerLeave: drag ? onPointerUp : undefined }
      : {},
  }
}
