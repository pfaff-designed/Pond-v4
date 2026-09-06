import { layoutBars, type BarLayout } from '../view/apply'

/**
 * `timeline` DATA contract (#11) — mirrors heatmap/data.ts. The AI/persisted
 * shape is deliberately FLAT and inline — one `{ label, start, end? }` per item,
 * no collection, no ids — and the layout semantics are NOT restated here: the
 * mapping delegates to the pure `layoutBars` core the #27 gantt view mode also
 * runs on (missing/backwards end → single-day milestone tick; no usable start →
 * item omitted; empty → null-bounded empty layout, never a crash).
 */

/** One timeline item: a label plus its ISO `YYYY-MM-DD` start (and optional end). */
export interface TimelineItem {
  label: string
  start: string
  end?: string
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/

/** A value reduced to its `YYYY-MM-DD` day, or null when absent/not an ISO day —
 *  the read-side tolerance for stale persisted data (t12 §2: never hard-fail). */
function isoDayOf(value: string | undefined): string | null {
  return typeof value === 'string' && ISO_DAY.test(value) ? value.slice(0, 10) : null
}

/**
 * Lay the block's inline items out as bars over one shared axis. Items are keyed
 * by their index (they carry no ids — like heatmap cells); everything else is
 * `layoutBars` verbatim.
 */
export function layoutTimeline(items: readonly TimelineItem[]): BarLayout {
  return layoutBars(
    items.map((item, i) => ({
      id: String(i),
      label: item.label,
      startIso: isoDayOf(item.start),
      endIso: isoDayOf(item.end),
    }))
  )
}

/**
 * Honest text summary for `serialize` (the prompt body + embedding source):
 * DRAWN bar count + the inclusive date range — what the user actually sees, not a
 * per-item dump. Mirrors `summarizeHeatmap`: head + optional title, figures, then
 * ` — caption`. No drawable item (empty, or nothing with a usable start) reads as
 * a calm "(no data)".
 */
export function summarizeTimeline(data: {
  title?: string
  caption?: string
  items: readonly TimelineItem[]
}): string {
  const head = `Timeline${data.title ? ` "${data.title}"` : ''}`
  const { bars, rangeStart, rangeEnd } = layoutTimeline(data.items)
  if (bars.length === 0 || !rangeStart || !rangeEnd) return `${head}: (no data)`
  const cap = data.caption ? ` — ${data.caption}` : ''
  const count = `${bars.length} ${bars.length === 1 ? 'item' : 'items'}`
  return `${head}: ${count}, ${rangeStart}–${rangeEnd}${cap}`
}
