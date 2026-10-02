import { addDays, displayValue, type CollectionRow } from './apply'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * The gantt view mode's pure half (#260, child 228d of #228) — the board's
 * geometry and the two readings the drawing needs, kept React-free beside the
 * renderer in `view.tsx` (the shape `chart-compact.ts` / `collection-chart-compact.tsx`
 * set in #259). Measured off `PondTemplate.dc.html`'s `renderVals()`:
 *
 *   gHead   { display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 10,
 *             paddingBottom: 6, borderBottom: '1px solid ' + a(.09) }
 *   gTicks  { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }
 *   gTick   { fontFamily: mono, fontSize: 10, color: a(.68) }
 *   gRow    { display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 10,
 *             alignItems: 'center', padding: '4px 0', borderBottom: '1px solid ' + a(.055) }
 *   gTrack  { position: 'relative', height: 18,
 *             backgroundImage: 'linear-gradient(90deg,' + a(.06) + ' 1px,transparent 1px)',
 *             backgroundSize: '25% 100%' }
 *   lStyle  { fontSize: 12, color: done ? a(.68) : fg, whiteSpace: 'nowrap',
 *             overflow: 'hidden', textOverflow: 'ellipsis' }
 *   bar     { position: 'absolute', top: 4, bottom: 4, left: s + '%', width: (e - s) + '%',
 *             borderRadius: 4, background: done ? a(.22) : fg }
 *
 * TWO hairlines, deliberately: the head's is ink .09 and each row's is ink .055.
 * Neither is `--mn-hair` — that token happens to be .055 light, but it is .07 dark,
 * and the head's .09 is a different value altogether. Both are written as literal
 * alphas so neither can be "snapped" to the token later.
 *
 * The axis is FOUR ticks at the range's quarters: `gTicks` is `repeat(4)` and the
 * track's gridlines repeat at `25%`, so each label owns a grid cell and the board's
 * fixture (`20 oct · 27 oct · 3 nov · 10 nov` over 28 days) is exactly the quarters.
 * That retires #57's `buildTicks` — a weekly series thinned against the measured
 * track so labels would not collide — because a label per cell cannot collide.
 * (`gantt-shared.ts` once also served the standalone `timeline` block, which #111
 * deleted; the name stays so the file's history reads.)
 *
 * Mobile (`96px` label column, 70-high tile elsewhere) is the frame's later slice:
 * `PondBlock` has no size axis yet, so the card's content is desktop with it.
 */

/** `gTicks: repeat(4, …)` — the axis has four labels, whatever the range. */
export const GANTT_TICK_COUNT = 4

/**
 * The four tick days: the range start and its ¼, ½, ¾ points, rounded to whole
 * days (calendar stepping via `addDays`, never millisecond arithmetic — a DST day
 * would shear the axis). A one-day range repeats its day: four cells, no crash.
 */
export function quarterTicks(rangeStart: string, totalDays: number): string[] {
  const last = Math.max(0, totalDays - 1)
  return Array.from({ length: GANTT_TICK_COUNT }, (_, i) =>
    addDays(rangeStart, Math.min(last, Math.round((totalDays * i) / GANTT_TICK_COUNT)))
  )
}

/**
 * A tick label in the board's own form — `20 oct`: day, then the lowercase short
 * month (the mono machine register is lowercase). Built at UTC noon and read in
 * UTC so a day never drifts across a timezone. The month is `en-US`'s three-letter
 * short form, pinned: `en-GB` writes `sept`, and the handoff's dates are `19 sep`.
 */
export function formatTick(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase()
  return `${d.getUTCDate()} ${month}`
}

/**
 * The board's `done` bar — `['book the van', 0, 8, 1]` — is the task the kanban
 * beside it files under its `done` lane (`project › tasks — board`), so a row is
 * done when a status/select property resolves to an option labelled `done`,
 * case-insensitive. The first status/select property decides, the same one a
 * `/board` groups by (`ensureBoardGroupBy`). No such property → nothing is done.
 */
export function ganttRowDone(schema: PropertySchema, row: CollectionRow): boolean {
  const def = schema.find((d) => d.type === 'status' || d.type === 'select')
  return def !== undefined && displayValue(def, row.values[def.id]).toLowerCase() === 'done'
}

/** The voidBox copy for a gantt with nothing dated — the template's `e` for `gantt`, verbatim. */
export const GANTT_EMPTY_LINE = 'tasks with a start and a due date draw here'

// ── Class recipes — literal strings, never through `cn` (#252) ──────────────────

/** `gHead`: grid · 120px label column · gap 10 · pb 6 · the .09 hairline. */
export const GANTT_HEAD =
  'grid grid-cols-[120px_minmax(0,1fr)] gap-[10px] border-b border-mn-text/[0.09] pb-[6px]'
/** `gTicks`: four equal cells. */
export const GANTT_TICKS = 'grid grid-cols-[repeat(4,minmax(0,1fr))]'
/** `gTick`: mono 10 / ink .68. */
export const GANTT_TICK = 'font-mono text-[10px] text-mn-text-secondary'
/** `gRow`: grid · 120px label column · gap 10 · centred · py 4 · the .055 hairline. */
export const GANTT_ROW =
  'grid grid-cols-[120px_minmax(0,1fr)] items-center gap-[10px] border-b border-mn-text/[0.055] py-[4px]'
/** `lStyle` minus its ink: 12px, one line, ellipsis. The ink is `GANTT_LABEL_INK`. */
export const GANTT_LABEL = 'truncate text-[12px]'
export const GANTT_LABEL_INK = { live: 'text-mn-text', done: 'text-mn-text-secondary' } as const
/** `gTrack`: 18 high; the gridlines are the inline `GANTT_TRACK_STYLE`. */
export const GANTT_TRACK = 'relative h-[18px]'
/**
 * The track's gridlines as the board draws them — a 1px line repeating every 25%,
 * in ink at .06. Inline because a hard-stop gradient over a role token needs
 * `color-mix`, which Tailwind's gradient utilities do not compose for a stop.
 */
export const GANTT_TRACK_STYLE = {
  backgroundImage:
    'linear-gradient(90deg, color-mix(in srgb, var(--color-mn-text) 6%, transparent) 1px, transparent 1px)',
  backgroundSize: '25% 100%',
} as const
/**
 * The bar rectangle's shell — `top 4 · bottom 4 · radius 4`, %-positioned by its
 * inline `left`/`width`. The min-width is a legibility floor the board does not
 * need at its fixture scale: a one-day bar on a long range would otherwise vanish,
 * and the editable bar's grab zones need something to sit on. Ink is `GANTT_BAR_INK`.
 */
export const GANTT_BAR_SHELL = 'absolute top-[4px] bottom-[4px] min-w-[0.5rem] rounded-[4px]'
/** `background: done ? a(.22) : fg`. */
export const GANTT_BAR_INK = { live: 'bg-mn-text', done: 'bg-mn-text/[0.22]' } as const
