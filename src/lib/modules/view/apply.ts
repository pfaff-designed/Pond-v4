/**
 * View row math (#19 slice 3) — the PURE filter / sort / group core a view runs
 * over its collection's rows, kept apart from the React renderer so it's directly
 * unit-testable and shared by every mode (table filters+sorts; board additionally
 * groups the already-filtered+sorted rows).
 *
 * Single-clause only (decision 15): one `filter`, one `sort` key, one `groupBy`
 * property. Everything is resolved through the collection's `_schema` so a
 * select/status value (a stored option *id*, slice 1) compares and buckets by the
 * right identity — with `optionForValue`'s legacy-label tolerance underneath so a
 * pre-resolution row never falls through. Nothing here throws: a stale/off-schema
 * value degrades (sorts last, lands in the "no value" bucket) rather than failing a
 * render — the same leniency as the read path (#18 decision 9).
 */
import {
  coerceValue,
  optionForValue,
  resolveOptionValue,
  type PropertyDef,
  type PropertySchema,
} from '@/lib/properties/schema'
import type { ViewFilter, ViewSort } from './schema'

/**
 * A collection row reduced to what the view draws: the row page's id + title, and
 * its typed property *values* (the `props` value map, schema stripped — see
 * `readValues`). Values are raw-as-stored; resolution to labels/chips happens here
 * and in the renderer via the schema, never baked into the row.
 */
export interface CollectionRow {
  id: string
  title: string
  values: Record<string, unknown>
}

/** Look a property up in the schema by id. */
function defById(schema: PropertySchema, id: string): PropertyDef | undefined {
  return schema.find((d) => d.id === id)
}

/**
 * A value reduced to a single comparable primitive for sort/filter, per its type:
 * number → the number; checkbox → 0/1; select/status → the option's *rank* (its
 * index in the schema's option list) so ordering follows the field's defined order
 * (Low→Medium→High), not alphabetics; date/text → the lowercased string. An
 * empty/unset value — or a select/status pointing at an option no longer in the
 * schema — returns `null`, so callers sort those last and treat them as
 * non-matching for value filters (the same leniency as grouping's no-value bucket).
 */
function comparable(def: PropertyDef, raw: unknown): string | number | null {
  const value = coerceValue(def, raw)
  if (value === null || value === '') return null
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? value : null
    case 'checkbox':
      return value ? 1 : 0
    case 'select':
    case 'status': {
      const opt = optionForValue(def, value)
      if (!opt) return null // off-schema/stale option → sinks last, like an empty
      // `opt` was resolved out of `def.options`, so its rank there is always found.
      return (def.options ?? []).findIndex((o) => o.id === opt.id)
    }
    case 'date':
      // ISO date/datetime strings sort chronologically as plain strings.
      return String(value)
    default:
      return String(value).toLowerCase()
  }
}

/**
 * Does a row's value satisfy the single filter clause? Choice properties compare
 * by option *id* for eq/neq (so a filter written by label or id both land), and by
 * option *label* for `contains`; numbers compare numerically; everything else by
 * string. An empty row value never matches a value comparison (except `neq`, which
 * it satisfies) — an absent value is genuinely "not equal".
 */
function matchesFilter(
  def: PropertyDef,
  raw: unknown,
  op: ViewFilter['op'],
  target: string
): boolean {
  const isChoice = def.type === 'select' || def.type === 'status'

  if (op === 'eq' || op === 'neq') {
    let a: string | number | null
    let b: string | number | null
    if (isChoice) {
      // Normalise both sides to option ids so label-vs-id never causes a miss.
      const rawId = resolveOptionValue(def, raw)
      a = rawId
      b = resolveOptionValue(def, target)
    } else {
      a = comparable(def, raw)
      b = comparable(def, target === '' ? null : target)
      // For non-choice, coerce the target through the same type lens as the value.
      if (def.type === 'number') b = target.trim() === '' ? null : Number(target)
      if (def.type === 'checkbox') b = /^(true|1|yes|checked)$/i.test(target.trim()) ? 1 : 0
    }
    const equal = a === b
    return op === 'eq' ? equal : !equal
  }

  if (op === 'contains') {
    const hay = isChoice
      ? (optionForValue(def, coerceValue(def, raw))?.label ?? String(coerceValue(def, raw) ?? ''))
      : String(coerceValue(def, raw) ?? '')
    return hay.toLowerCase().includes(target.toLowerCase())
  }

  // gt / lt — numeric when both sides are numbers, else lexical on the comparable.
  const a = comparable(def, raw)
  if (a === null) return false
  const b: string | number = def.type === 'number' ? Number(target) : String(target).toLowerCase()
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(b)) return false
    return op === 'gt' ? a > b : a < b
  }
  const as = String(a)
  const bs = String(b)
  return op === 'gt' ? as > bs : as < bs
}

/** Keep only the rows matching the filter clause. No clause → all rows, in order. */
export function filterRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  filter?: ViewFilter
): CollectionRow[] {
  if (!filter) return [...rows]
  const def = defById(schema, filter.property)
  // A filter on an unknown property is inert (shows everything) rather than empty —
  // a stale clause must not silently blank the view.
  if (!def) return [...rows]
  return rows.filter((r) => matchesFilter(def, r.values[filter.property], filter.op, filter.value))
}

/**
 * Sort rows by the single sort key. Stable: rows with an empty value for the key
 * always sink to the bottom regardless of direction (a blank cell is never the
 * "smallest"); the rest order by their comparable, ascending or descending.
 */
export function sortRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  sort?: ViewSort
): CollectionRow[] {
  if (!sort) return [...rows]
  const def = defById(schema, sort.key)
  if (!def) return [...rows]
  const dir = sort.dir === 'desc' ? -1 : 1
  return [...rows].sort((ra, rb) => {
    const a = comparable(def, ra.values[sort.key])
    const b = comparable(def, rb.values[sort.key])
    if (a === null && b === null) return 0
    if (a === null) return 1 // empties last, both directions
    if (b === null) return -1
    if (a < b) return -1 * dir
    if (a > b) return 1 * dir
    return 0
  })
}

/** Filter then sort — the row pipeline every mode runs before it draws. */
export function applyView(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  config: { filter?: ViewFilter; sort?: ViewSort }
): CollectionRow[] {
  return sortRows(filterRows(rows, schema, config.filter), schema, config.sort)
}

/** One board column: an option bucket (or the trailing "no value" bucket, id null). */
export interface ViewGroup {
  /** The option id this column collects, or null for the unset/unmatched bucket. */
  id: string | null
  label: string
  /** Option token/hex for the header dot; absent on the null bucket. */
  color?: string
  rows: CollectionRow[]
}

/**
 * Bucket rows by a select/status property for the board (decision 14). One column
 * per schema option in schema order, plus a trailing "No <name>" bucket for rows
 * whose value is empty or points at an option no longer in the schema — so every
 * row is placed exactly once and none is dropped. Returns null when `groupById`
 * doesn't name a select/status property (the board can't group by anything else).
 */
export function groupRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  groupById: string | undefined
): { def: PropertyDef; groups: ViewGroup[] } | null {
  if (!groupById) return null
  const def = defById(schema, groupById)
  if (!def || (def.type !== 'select' && def.type !== 'status')) return null

  const options = def.options ?? []
  const byOption = new Map<string, CollectionRow[]>(options.map((o) => [o.id, []]))
  const unset: CollectionRow[] = []

  for (const row of rows) {
    const opt = optionForValue(def, coerceValue(def, row.values[groupById]))
    if (opt && byOption.has(opt.id)) byOption.get(opt.id)!.push(row)
    else unset.push(row)
  }

  const groups: ViewGroup[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    color: o.color,
    rows: byOption.get(o.id) ?? [],
  }))
  groups.push({ id: null, label: `No ${def.name}`, rows: unset })
  return { def, groups }
}

/** One calendar lane: the rows sharing a date (`iso`), or the trailing unset bucket. */
export interface DateBucket {
  /** The `YYYY-MM-DD` day this lane collects, or null for the undated bucket. */
  iso: string | null
  rows: CollectionRow[]
}

/**
 * Which date property a calendar places rows by. Prefers the one the view names in
 * `groupBy` (the board reuses the same field, decision 15) when it's a `date`
 * property; otherwise falls back to the first date property in the schema. Returns
 * undefined when the collection has no date property at all — the caller shows a
 * notice rather than an empty frame.
 */
export function pickDateDef(
  schema: PropertySchema,
  groupBy: string | undefined
): PropertyDef | undefined {
  if (groupBy) {
    const named = defById(schema, groupBy)
    if (named?.type === 'date') return named
  }
  return schema.find((d) => d.type === 'date')
}

/**
 * Bucket rows into calendar lanes by a date property (the agenda layout). One lane
 * per distinct `YYYY-MM-DD` value, chronological ascending, plus a trailing undated
 * bucket (iso null) for rows with no/blank date — so every row lands exactly once.
 * A datetime value buckets by its date part (first 10 chars). Returns null when
 * `dateById` doesn't name a `date` property (mirrors `groupRows`' guard).
 */
export function groupRowsByDate(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  dateById: string | undefined
): { def: PropertyDef; buckets: DateBucket[] } | null {
  if (!dateById) return null
  const def = defById(schema, dateById)
  if (!def || def.type !== 'date') return null

  const byDate = new Map<string, CollectionRow[]>()
  const undated: CollectionRow[] = []
  for (const row of rows) {
    const value = coerceValue(def, row.values[dateById])
    const iso = typeof value === 'string' && value ? value.slice(0, 10) : null
    if (iso) {
      const lane = byDate.get(iso)
      if (lane) lane.push(row)
      else byDate.set(iso, [row])
    } else {
      undated.push(row)
    }
  }

  const buckets: DateBucket[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([iso, laneRows]) => ({ iso, rows: laneRows }))
  if (undated.length) buckets.push({ iso: null, rows: undated })
  return { def, buckets }
}

// ── Gantt (#27) ─────────────────────────────────────────────────────────────

/** The Start + End date properties a gantt lays bars on. `endDef` is undefined when
 *  the collection has only one date property — every bar is then a single-day tick. */
export interface GanttDefs {
  startDef: PropertyDef
  endDef?: PropertyDef
}

/** One laid-out gantt bar: the row plus its resolved `YYYY-MM-DD` start/end days. */
export interface GanttBar {
  row: CollectionRow
  startIso: string
  endIso: string
}

/** The gantt layout: bars (sorted by start ascending) over an inclusive [rangeStart,
 *  rangeEnd] day span. Both bounds are null when no row has a start date. */
export interface GanttLayout {
  bars: GanttBar[]
  rangeStart: string | null
  rangeEnd: string | null
}

/**
 * Which date properties a gantt draws bars from (mirrors `pickDateDef`). Prefers the
 * ids the view names in `startDate`/`endDate` when they resolve to `date` properties;
 * otherwise infers positionally — the 1st date property is Start, the 2nd is End.
 * With a single date property, End is undefined (bars become single-day ticks).
 * Returns undefined when the collection has no date property at all — the caller
 * shows a notice rather than an empty frame.
 */
export function pickGanttDefs(
  schema: PropertySchema,
  startId?: string,
  endId?: string
): GanttDefs | undefined {
  const dates = schema.filter((d) => d.type === 'date')
  if (dates.length === 0) return undefined
  const namedDate = (id: string | undefined): PropertyDef | undefined => {
    if (!id) return undefined
    const def = defById(schema, id)
    return def?.type === 'date' ? def : undefined
  }
  const startDef = namedDate(startId) ?? dates[0]
  const endDef = namedDate(endId) ?? dates.find((d) => d.id !== startDef.id)
  return { startDef, endDef }
}

/** A date value reduced to its `YYYY-MM-DD` day, or null when empty/non-string. */
function dayOf(def: PropertyDef, raw: unknown): string | null {
  const value = coerceValue(def, raw)
  return typeof value === 'string' && value ? value.slice(0, 10) : null
}

/** One candidate bar for `layoutBars` (#11): dates already resolved to `YYYY-MM-DD`
 *  (or null/absent for "no value"). `id` is any caller-stable key; `label` rides
 *  along so a rowless caller (the timeline module) can draw its gutter. */
export interface BarInput {
  id: string
  label: string
  startIso: string | null
  endIso?: string | null
}

/** One laid-out bar: the input's id + label with resolved inclusive start/end days. */
export interface LaidOutBar {
  id: string
  label: string
  startIso: string
  endIso: string
}

/** The shared bar layout: bars (sorted by start ascending) over an inclusive
 *  [rangeStart, rangeEnd] day span. Both bounds are null when no item has a start. */
export interface BarLayout {
  bars: LaidOutBar[]
  rangeStart: string | null
  rangeEnd: string | null
}

/**
 * The PURE bar-layout core (#11) — shared by the #27 gantt view mode
 * (`layoutGanttBars`, which resolves collection rows' date props first) and the
 * standalone `timeline` module (inline AI-authored items). Each item's bar runs
 * from its start day to its end day (both `YYYY-MM-DD`); a missing end becomes a
 * single-day tick; a missing start omits the item entirely; an end before its
 * start clamps to a single-day tick (a mis-entered range never draws backwards).
 * Bars sort by start ascending, then end. `rangeStart`/`rangeEnd` are the min
 * start / max end across all bars (null when there are no bars).
 */
export function layoutBars(items: readonly BarInput[]): BarLayout {
  const bars: LaidOutBar[] = []
  for (const item of items) {
    const startIso = item.startIso
    if (!startIso) continue // no start → omitted
    const rawEnd = item.endIso ?? null
    // Missing end → single-day; an end before the start also collapses to single-day.
    const endIso = rawEnd && rawEnd >= startIso ? rawEnd : startIso
    bars.push({ id: item.id, label: item.label, startIso, endIso })
  }
  bars.sort((a, b) =>
    a.startIso < b.startIso
      ? -1
      : a.startIso > b.startIso
        ? 1
        : a.endIso < b.endIso
          ? -1
          : a.endIso > b.endIso
            ? 1
            : 0
  )
  const rangeStart = bars.length
    ? bars.reduce((m, b) => (b.startIso < m ? b.startIso : m), bars[0].startIso)
    : null
  const rangeEnd = bars.length
    ? bars.reduce((m, b) => (b.endIso > m ? b.endIso : m), bars[0].endIso)
    : null
  return { bars, rangeStart, rangeEnd }
}

/**
 * Lay a collection's rows out as gantt bars over one adaptive timeline: resolve
 * each row's Start/End date props to ISO days, delegate the actual layout to the
 * pure `layoutBars` core, and re-attach the `row` each bar came from (the drag
 * writeback needs it). All bar semantics — tick for missing/backwards end, omit
 * on no start, sort, range — live in `layoutBars` so the #27 view mode and the
 * #11 timeline module can never drift.
 */
export function layoutGanttBars(
  rows: readonly CollectionRow[],
  startDef: PropertyDef,
  endDef?: PropertyDef
): GanttLayout {
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const { bars, rangeStart, rangeEnd } = layoutBars(
    rows.map((row) => ({
      id: row.id,
      label: row.title,
      startIso: dayOf(startDef, row.values[startDef.id]),
      endIso: endDef ? dayOf(endDef, row.values[endDef.id]) : null,
    }))
  )
  return {
    // `id` came from the row map one line up, so the lookup can't miss.
    bars: bars.map((b) => ({ row: rowById.get(b.id)!, startIso: b.startIso, endIso: b.endIso })),
    rangeStart,
    rangeEnd,
  }
}

// ── Gantt reschedule (drag) ───────────────────────────────────────────────────

/**
 * Convert a horizontal pointer travel (px) into a signed whole-day delta over a
 * gantt's frozen axis. The track spans `totalDays` across `trackWidthPx` pixels, so
 * one day is `trackWidthPx / totalDays` px; the delta rounds to the nearest whole
 * day (sub-day travel — a click — rounds to 0). A zero/absent track width yields 0
 * rather than dividing by zero, so an un-measured track never throws or jumps.
 */
export function pixelsToDays(deltaPx: number, trackWidthPx: number, totalDays: number): number {
  if (trackWidthPx <= 0) return 0
  return Math.round((deltaPx / trackWidthPx) * totalDays)
}

/**
 * Parse a `YYYY-MM-DD` day to a UTC epoch-day integer (timezone-stable, DST-proof) —
 * the shared unit the renderer positions bars/gridlines by and `addDays` counts in. A
 * malformed value yields 0 (the Unix epoch) rather than NaN, so a bad date degrades
 * rather than poisoning arithmetic.
 */
export function epochDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return 0
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/** Add `n` days to a `YYYY-MM-DD` day (UTC-stable, DST-proof), returning `YYYY-MM-DD`.
 *  A malformed input is returned unchanged. */
export function addDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return new Date((epochDay(iso) + n) * 86_400_000).toISOString().slice(0, 10)
}

/** Which part of a gantt bar a drag manipulates. */
export type ShiftMode = 'move' | 'resize-start' | 'resize-end'

/**
 * A bar's dates as the row actually stores them: `endIso` is null when the row has no
 * End value (a milestone), distinct from a genuine single-day span. `hasEndDef` is
 * whether an End *property* exists at all — false for a single-date collection, where
 * there is nowhere to store an end and resize is therefore inert.
 */
export interface BarDates {
  startIso: string
  endIso: string | null
  hasEndDef: boolean
}

/** The dates a shift changed — only the fields that actually moved (empty = no-op). */
export interface BarShift {
  startIso?: string
  endIso?: string
}

/**
 * Apply a whole-day `dayDelta` to a bar per the drag `mode`, returning only the date
 * fields that changed (so the caller writes exactly those). Rules (spec):
 *   - move: shift start and end together (duration preserved); a milestone or a
 *     single-date row shifts start ONLY — moving never creates an end.
 *   - resize-start: move start alone, clamped so it can't cross the end (min 1-day).
 *   - resize-end: move end alone, clamped so it can't precede the start; on a
 *     milestone this CREATES an end (tick → span); inert when no end property exists.
 * A field is returned only when it differs from the stored value, so a zero delta —
 * or a clamp that pins a value where it already sits — is a clean no-op.
 */
export function shiftBar(dates: BarDates, mode: ShiftMode, dayDelta: number): BarShift {
  const { startIso, endIso, hasEndDef } = dates
  const out: BarShift = {}

  if (mode === 'move') {
    const nextStart = addDays(startIso, dayDelta)
    if (nextStart !== startIso) out.startIso = nextStart
    // Only a row with a stored end shifts its end; milestones/single-date stay ticks.
    if (endIso !== null) {
      const nextEnd = addDays(endIso, dayDelta)
      if (nextEnd !== endIso) out.endIso = nextEnd
    }
    return out
  }

  if (mode === 'resize-start') {
    // Start can't pass the end; a milestone clamps against its own single day.
    const boundary = endIso ?? startIso
    let nextStart = addDays(startIso, dayDelta)
    if (nextStart > boundary) nextStart = boundary
    if (nextStart !== startIso) out.startIso = nextStart
    return out
  }

  // resize-end
  if (!hasEndDef) return out // nowhere to store an end → inert
  const base = endIso ?? startIso // a milestone extends from its own day
  let nextEnd = addDays(base, dayDelta)
  if (nextEnd < startIso) nextEnd = startIso // end can't precede start
  if (nextEnd !== base) out.endIso = nextEnd
  return out
}

/** The display string for a value in a cell/chip — the read-side of `comparable`,
 *  but preserving original case (comparable lowercases for ordering). Empty → ''. */
export function displayValue(def: PropertyDef, raw: unknown): string {
  const value = coerceValue(def, raw)
  if (value === null || value === '') return ''
  switch (def.type) {
    case 'checkbox':
      return value ? '✓' : ''
    case 'select':
    case 'status':
      return optionForValue(def, value)?.label ?? String(value)
    case 'relation':
      return Array.isArray(value) ? String(value.length) : ''
    default:
      return String(value)
  }
}
