/**
 * View AGGREGATION core (#111) — the pure math behind the `chart` and `big-number`
 * view modes, kept apart from the React renderer (like `apply.ts`) so it is directly
 * unit-testable AND callable from the server-safe `serialize` facet.
 *
 * The design law this enforces (`Pond 03 Concepts.dc.html`): a view is "a block that
 * shows a database: table, gallery, board, timeline, chart or big number… the record
 * is the source of truth… **nothing holds a copy**." So a chart or a headline figure
 * is never authored data — it is an aggregation computed AT READ TIME over the
 * collection's rows, exactly like a table's cells. Edit a record in any view and the
 * chart moves, because there is no stored copy to drift.
 *
 * Module boundary (why this file, not the renderer): the aggregation must produce the
 * SAME figures for the screen and for `serialize` (the prompt body + embedding
 * source) — #111 AC 8. One pure function, two callers, no drift.
 *
 * Dependency direction: this file owns the `VIEW_AGGS` / `CHART_KINDS` vocabularies as
 * VALUES; `schema.ts` imports them to build its zod enums and type-imports its own
 * config types back. Types erase at compile, so the runtime graph is one-directional
 * (schema → aggregate) and acyclic — the same trick `stat/format.ts` uses.
 */
import {
  coerceValue,
  optionForValue,
  type PropertyDef,
  type PropertySchema,
} from '@/lib/properties/schema'
import type { ChartStatFlowFormat } from '@/components/charts/chart-stat-flow'
import { statFormatOptions } from '../stat/format'
import type { ChartPoint } from '../chart/data'
import type { ViewChartConfig, ViewBigNumberConfig, ViewFigureFormat } from './schema'
import type { CollectionRow } from './apply'

/**
 * The aggregation verbs. Deliberately the SAME vocabulary the design gives a
 * relation's read-back (rollup) — a chart series, a big number and a rollup all
 * answer "one number out of many records", so they must not speak three dialects.
 * `latest` takes the value of the LAST row in the (already filtered/sorted) order —
 * the "current reading" verb a weight log or a balance needs.
 */
export const VIEW_AGGS = ['sum', 'avg', 'count', 'min', 'max', 'latest'] as const
export type ViewAgg = (typeof VIEW_AGGS)[number]

/** Human labels for the agg picker + serialize prose. */
export const AGG_LABELS: Record<ViewAgg, string> = {
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max',
  latest: 'Latest',
}

/**
 * Every chart KIND a chart-mode view may name. The #94 kinds are `kind` VALUES here,
 * never new block types — that is the whole point of #111. Only a subset is DRAWN
 * today (`DRAWN_CHART_KINDS` below); the rest are accepted by the schema and render a
 * calm "not drawn yet" notice, so #94 can land renderers without touching the
 * persisted contract or re-migrating a single page.
 */
export const CHART_KINDS = [
  'line',
  'area',
  'bar',
  'composed',
  'net',
  'gauge',
  'radar',
  'scatter',
  'sankey',
  'sunburst',
  'funnel',
] as const
export type ChartKind = (typeof CHART_KINDS)[number]

/** The kinds with a renderer today (the three promoted Bklit visuals). #94 adds the rest. */
export const DRAWN_CHART_KINDS = ['line', 'area', 'bar'] as const satisfies readonly ChartKind[]

/** Is this kind drawable now, or is it an accepted-but-undrawn #94 kind? */
export function isDrawnChartKind(kind: ChartKind): boolean {
  return (DRAWN_CHART_KINDS as readonly string[]).includes(kind)
}

// ── Property lookup + numeric reading ────────────────────────────────────────

/** Look a property up by id. Undefined for a stale config reference (never throws). */
export function defById(schema: PropertySchema, id: string | undefined): PropertyDef | undefined {
  if (!id) return undefined
  return schema.find((d) => d.id === id)
}

/**
 * A row value reduced to a NUMBER for aggregation, or null when it carries none.
 * `number` reads straight; `checkbox` counts as 1/0 (so "how many done" is a sum);
 * `rollup` values are already numeric; a `relation` contributes its link COUNT; text
 * that happens to hold a number is honoured (a legacy/imported cell), and anything
 * else — empty, a date, a label — is null and simply does not participate. Nothing
 * throws: an off-type cell degrades out of the aggregate rather than failing a render
 * (the same leniency as the read path, #18 decision 9).
 */
export function numericValue(def: PropertyDef, raw: unknown): number | null {
  const value = coerceValue(def, raw)
  if (value === null || value === '') return null
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? value : null
    case 'checkbox':
      return value ? 1 : 0
    case 'relation':
      return Array.isArray(value) ? value.length : null
    default: {
      if (typeof value === 'number') return value
      const n = Number(value)
      return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(n) ? n : null
    }
  }
}

/**
 * Aggregate one property across rows. `count` counts ROWS (every record, whether or
 * not it carries a value — "how many records" is the question) and needs no property
 * at all; every other verb reads the numeric values and ignores the rows that hold
 * none. No participating value → null, which renders as "—" rather than a lying 0.
 */
export function aggregateRows(
  rows: readonly CollectionRow[],
  def: PropertyDef | undefined,
  agg: ViewAgg
): number | null {
  if (agg === 'count') return rows.length
  if (!def) return null
  const nums: number[] = []
  for (const row of rows) {
    const n = numericValue(def, row.values[def.id])
    if (n !== null) nums.push(n)
  }
  if (nums.length === 0) return null
  switch (agg) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0)
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length
    case 'min':
      return Math.min(...nums)
    case 'max':
      return Math.max(...nums)
    case 'latest':
      return nums[nums.length - 1]
  }
}

// ── Figure formatting ────────────────────────────────────────────────────────

/**
 * The Intl options per figure format — the NumberFlow bridge for the big-number
 * renderer. Delegates to `stat/format.ts`: the `stat` BLOCK is retired from creation
 * (#111), but its pure formatter is the established truth for number/currency/percent
 * in this codebase, and a big-number view must render a figure identically to the
 * headline stat it supersedes. `ViewFigureFormat` and `StatFormat` are the same three
 * words, so no mapping is needed.
 */
export function figureFormatOptions(format?: ViewFigureFormat): ChartStatFlowFormat {
  return statFormatOptions(format)
}

/**
 * Format a figure for display. Pinned to en-US: the formatted string feeds BOTH the
 * screen and `serialize` (prompts/embeddings), so it must be deterministic across
 * environments. `percent` treats the value as a FRACTION (0.62 → "62%"), matching
 * Intl semantics and the `stat` block it supersedes. A null figure reads "—" — an
 * aggregate with nothing to read is not zero.
 */
export function formatFigure(value: number | null, format?: ViewFigureFormat): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en-US', figureFormatOptions(format)).format(value)
}

// ── Config inference (a mode that arrives unconfigured still draws) ───────────
//
// `viewSchema` lives inside a zod discriminatedUnion, which cannot carry a
// cross-field refinement — so a `mode:'chart'` block with NO `chart` config is
// structurally valid (exactly as a `board` with no `groupBy` is). Rather than a dead
// view, an unconfigured mode INFERS a sane config from the schema, the same way a
// gantt infers its start/end dates from the first two date properties. Inference is
// pure and shared by the renderer and serialize, so both read the same figures.

/** The first property whose values aggregate numerically (the obvious series/figure). */
function firstNumericDef(schema: PropertySchema): PropertyDef | undefined {
  return schema.find((d) => d.type === 'number' || d.type === 'rollup')
}

/** The first property that reads as a category/x axis: a date, then a choice, then text. */
function firstCategoryDef(schema: PropertySchema): PropertyDef | undefined {
  return (
    schema.find((d) => d.type === 'date') ??
    schema.find((d) => d.type === 'select' || d.type === 'status') ??
    schema.find((d) => d.type === 'text')
  )
}

/**
 * The chart config a chart-mode view actually renders with: the stored config, with
 * each missing piece inferred. An unresolvable `xProperty` falls back to the row
 * TITLE (`xProperty: undefined` means "one point per record, labelled by title") —
 * always drawable, never empty. A series whose property is gone is dropped; with no
 * series left, the count of records is charted, which is honest and non-empty.
 */
export function resolveChartConfig(
  schema: PropertySchema,
  config: ViewChartConfig | undefined
): { kind: ChartKind; xDef?: PropertyDef; series: { def?: PropertyDef; agg: ViewAgg }[]; stacked: boolean } {
  const kind = config?.kind ?? 'bar'
  const xDef = defById(schema, config?.xProperty) ?? (config ? undefined : firstCategoryDef(schema))
  const declared = (config?.series ?? [])
    .map((s) => ({ def: defById(schema, s.property), agg: s.agg }))
    .filter((s) => s.def !== undefined || s.agg === 'count')
  const series = declared.length
    ? declared
    : [{ def: firstNumericDef(schema), agg: (firstNumericDef(schema) ? 'sum' : 'count') as ViewAgg }]
  return { kind, xDef, series, stacked: config?.stacked ?? false }
}

/** The big-number config a big-number view renders with, missing pieces inferred. */
export function resolveBigNumberConfig(
  schema: PropertySchema,
  config: ViewBigNumberConfig | undefined
): { def?: PropertyDef; agg: ViewAgg; format?: ViewFigureFormat } {
  const def = defById(schema, config?.property) ?? (config ? undefined : firstNumericDef(schema))
  const agg: ViewAgg = config?.agg ?? (def ? 'sum' : 'count')
  // A config naming a property that no longer exists degrades to counting records
  // rather than showing "—" forever: the view still answers "how much is here".
  if (!def && agg !== 'count') return { def: undefined, agg: 'count', format: config?.format }
  return { def, agg, format: config?.format }
}

// ── The two derivations ──────────────────────────────────────────────────────

/** One chart series' label + aggregated points, ready for the card legend. */
export interface ChartSeriesSpec {
  /** Legend/series name: the property name, qualified by its verb when not a plain sum. */
  name: string
}

/** A chart view's drawable data: point-major rows plus the series/axis labels. */
export interface ChartData {
  kind: ChartKind
  points: ChartPoint[]
  series: ChartSeriesSpec[]
  /** The x-axis label (the category property's name, or "Record" when bucketing by title). */
  xLabel: string
  stacked: boolean
}

/** The series' display name: "Hours" for a plain sum, "Hours (avg)" otherwise. */
function seriesName(def: PropertyDef | undefined, agg: ViewAgg): string {
  if (!def) return 'Records'
  return agg === 'sum' ? def.name : `${def.name} (${agg})`
}

/** The category a row falls under, as a label. Empty/unset buckets under "No value". */
function categoryOf(def: PropertyDef | undefined, row: CollectionRow): string {
  if (!def) return row.title || 'Untitled'
  const value = coerceValue(def, row.values[def.id])
  if (value === null || value === '') return 'No value'
  if (def.type === 'select' || def.type === 'status') {
    return optionForValue(def, value)?.label ?? String(value)
  }
  if (def.type === 'checkbox') return value ? 'Yes' : 'No'
  return String(value)
}

/**
 * Derive a chart's points from a collection's ROWS (#111) — the whole point of the
 * issue: no `points` are ever stored, they are computed here from the records every
 * time. Rows are bucketed by the x property (first-seen order preserved, so a sorted
 * view charts in its own order) and each series aggregates within its bucket.
 *
 * Pass the ALREADY filter/sort-applied rows (`applyView`): a chart must honour the
 * view's own filter and sort exactly as its table does, and `latest` depends on it.
 */
export function chartDataFromRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  config: ViewChartConfig | undefined
): ChartData {
  const { kind, xDef, series, stacked } = resolveChartConfig(schema, config)
  const names = series.map((s) => seriesName(s.def, s.agg))

  // Bucket rows by category, keeping first-seen order (the view's own row order).
  const order: string[] = []
  const buckets = new Map<string, CollectionRow[]>()
  for (const row of rows) {
    const key = categoryOf(xDef, row)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else {
      buckets.set(key, [row])
      order.push(key)
    }
  }

  const points: ChartPoint[] = order.map((x) => {
    const bucketRows = buckets.get(x) ?? []
    const values: Record<string, number> = {}
    series.forEach((s, i) => {
      const figure = aggregateRows(bucketRows, s.def, s.agg)
      // A bucket with no participating value is a GAP, not a zero (chart/data.ts
      // contract): an absent series key renders as a break in the line.
      if (figure !== null) values[names[i]] = figure
    })
    return { x, values }
  })

  return {
    kind,
    points,
    series: names.map((name) => ({ name })),
    xLabel: xDef?.name ?? 'Record',
    stacked,
  }
}

/** A big-number view's drawable figure. */
export interface BigNumberData {
  /** The aggregated figure, or null when nothing participates (renders "—"). */
  value: number | null
  /** The en-US formatted figure — identical on screen and in serialize. */
  formatted: string
  /** The kicker: what this figure IS ("Hours (avg)", "Records"). */
  label: string
  /** How many records the figure was read over — the honesty line under the figure. */
  recordCount: number
  /** The compare figure's signed change as a FRACTION, when a delta is configured. */
  delta?: number
}

/**
 * Derive a big-number view's figure from the collection's rows — ONE oversized
 * number a data page leads with (#94's product stance, realised as a view mode).
 *
 * `delta` (when configured) compares the aggregate over the rows matching the
 * compare clause against the aggregate over the REST, as a fraction of the rest —
 * "this month vs the others". Kept deliberately small: a compare is one clause, like
 * a filter (decision 15).
 */
export function bigNumberFromRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  config: ViewBigNumberConfig | undefined
): BigNumberData {
  const { def, agg, format } = resolveBigNumberConfig(schema, config)
  const value = aggregateRows(rows, def, agg)
  const data: BigNumberData = {
    value,
    formatted: formatFigure(value, format),
    label: seriesName(def, agg),
    recordCount: rows.length,
  }

  const compare = config?.delta
  if (compare) {
    const compareDef = defById(schema, compare.property)
    if (compareDef) {
      const target = String(compare.value ?? '')
      const isMatch = (row: CollectionRow) =>
        String(coerceValue(compareDef, row.values[compareDef.id]) ?? '') === target
      const now = aggregateRows(rows.filter(isMatch), def, agg)
      const before = aggregateRows(rows.filter((r) => !isMatch(r)), def, agg)
      if (now !== null && before !== null && before !== 0) {
        data.delta = (now - before) / Math.abs(before)
      }
    }
  }

  return data
}

/** Signed percent for a delta FRACTION — "+12%" / "-5%". Serialize + view voice. */
export function signedDelta(delta: number): string {
  const pct = Math.round(Math.abs(delta) * 1000) / 10
  return `${delta < 0 ? '-' : '+'}${pct}%`
}
