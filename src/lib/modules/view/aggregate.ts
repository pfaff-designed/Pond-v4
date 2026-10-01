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
 * (schema → aggregate) and acyclic — the same trick `figure-format.ts` uses.
 */
import {
  coerceValue,
  type PropertyDef,
  type PropertySchema,
} from '@/lib/properties/schema'
import type { ChartStatFlowFormat } from '@/components/charts/chart-stat-flow'
import { statFormatOptions } from './figure-format'
import type { ViewBigNumberConfig, ViewFigureFormat } from './schema'
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
 * Every chart KIND a chart-mode view may name — the thirteen `PondChart.dc.html`
 * declares, in the board's own order. They are `kind` VALUES here, never block types:
 * that is the whole point of #111, and it is why `heatmap` and `ring` are kinds rather
 * than the deleted `heatmap` / `metric-ring` blocks they replace. All thirteen draw
 * (`collection-chart.tsx` → `src/components/charts/*`); the derivation that feeds
 * them lives in `chart-data.ts`.
 */
export const CHART_KINDS = [
  'line',
  'area',
  'bar',
  'composed',
  'net',
  'heatmap',
  'ring',
  'gauge',
  'radar',
  'scatter',
  'sankey',
  'sunburst',
  'funnel',
] as const
export type ChartKind = (typeof CHART_KINDS)[number]

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
 * renderer. Delegates to `figure-format.ts`, the one pure formatter for
 * number/currency/percent in this codebase.
 */
export function figureFormatOptions(format?: ViewFigureFormat): ChartStatFlowFormat {
  return statFormatOptions(format)
}

/**
 * Format a figure for display. Pinned to en-US: the formatted string feeds BOTH the
 * screen and `serialize` (prompts/embeddings), so it must be deterministic across
 * environments. `percent` treats the value as a FRACTION (0.62 → "62%"), matching
 * Intl semantics. A null figure reads "—" — an
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
export function firstNumericDef(schema: PropertySchema): PropertyDef | undefined {
  return schema.find((d) => d.type === 'number' || d.type === 'rollup')
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

/** The series' display name: "Hours" for a plain sum, "Hours (avg)" otherwise. */
export function seriesName(def: PropertyDef | undefined, agg: ViewAgg): string {
  if (!def) return 'Records'
  return agg === 'sum' ? def.name : `${def.name} (${agg})`
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
