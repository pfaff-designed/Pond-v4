/**
 * Chart derivation for the `chart` view mode (#111 / #94) — the rows of a
 * collection AGGREGATED into drawable points at read time. Split from
 * `aggregate.ts` (which keeps the verbs and the big number) so each file stays
 * small; both are pure, server-safe, and shared by the renderer and `serialize`.
 *
 * Every one of the thirteen kinds reads the same `ChartData`: point-major
 * `{ x, values }` rows bucketed by the x property. Five kinds need one extra
 * reading, derived here so the renderers stay dumb:
 * - **scatter** keeps one point PER RECORD (no bucket merge) — each dot a night.
 * - **sunburst** carries each bucket's records as `leaves` — the outer ring.
 * - **gauge** reads ONE figure over all rows against a `target` (the record count
 *   when none is configured — "14 of 24").
 * - **ring** reads each bucket as a PART OF THE WHOLE — the board's "budget share",
 *   `transactions · category, £`: every positive bucket against the total.
 * - **heatmap** reads a DATE × VALUE calendar — the board's "workouts",
 *   `sessions · date, minutes`: one cell per day, so it needs a date x property.
 */
import { coerceValue, optionForValue, type PropertyDef, type PropertySchema } from '@/lib/properties/schema'
import type { ChartPoint } from '../chart/data'
import type { ViewChartConfig } from './schema'
import type { CollectionRow } from './apply'
import type { HeatmapCell } from './heatmap-data'
import { aggregateRows, defById, firstNumericDef, seriesName, type ChartKind, type ViewAgg } from './aggregate'

/** A calendar day, `YYYY-MM-DD` — the prefix a stored ISO date/datetime starts with. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** The first property that reads as a category/x axis: a date, then a choice, then text. */
function firstCategoryDef(schema: PropertySchema): PropertyDef | undefined {
  return (
    schema.find((d) => d.type === 'date') ??
    schema.find((d) => d.type === 'select' || d.type === 'status') ??
    schema.find((d) => d.type === 'text')
  )
}

/**
 * What the x axis IS, decided ONCE from the property schema (never guessed from
 * the labels): a `date` property reads chronologically; a `number`/`rollup`
 * property is a measure; everything else — select, status, text, checkbox, the
 * record title — is a CATEGORY whose labels are shown as given. The time-series
 * renderers must never build a Date from a category (#94: `new Date('o-rent')` →
 * `Intl.DateTimeFormat#format` → RangeError → the page died).
 */
export type ChartXAxis = 'date' | 'number' | 'category'

export function classifyXAxis(def: PropertyDef | undefined): ChartXAxis {
  if (!def) return 'category'
  if (def.type === 'date') return 'date'
  if (def.type === 'number' || def.type === 'rollup') return 'number'
  return 'category'
}

export interface ResolvedChartConfig {
  kind: ChartKind
  xDef?: PropertyDef
  /** The x axis's nature, from the schema (see `classifyXAxis`). */
  xAxis: ChartXAxis
  series: { def?: PropertyDef; agg: ViewAgg }[]
  stacked: boolean
  target?: number
}

/**
 * The chart config a chart-mode view actually renders with: the stored config, with
 * each missing piece inferred. An unresolvable `xProperty` falls back to the row
 * TITLE (`xProperty: undefined` means "one point per record, labelled by title") —
 * always drawable, never empty. A series whose property is gone is dropped; with no
 * series left, the first NUMERIC property is plotted (summed) — only a schema with
 * no numeric property at all falls back to counting records.
 */
export function resolveChartConfig(schema: PropertySchema, config: ViewChartConfig | undefined): ResolvedChartConfig {
  const kind = config?.kind ?? 'bar'
  const xDef = defById(schema, config?.xProperty) ?? (config ? undefined : firstCategoryDef(schema))
  const declared = (config?.series ?? [])
    .map((s) => ({ def: defById(schema, s.property), agg: s.agg }))
    .filter((s) => s.def !== undefined || s.agg === 'count')
  const series = declared.length
    ? declared
    : [{ def: firstNumericDef(schema), agg: (firstNumericDef(schema) ? 'sum' : 'count') as ViewAgg }]
  return { kind, xDef, xAxis: classifyXAxis(xDef), series, stacked: config?.stacked ?? false, target: config?.target }
}

/** One chart series' label, ready for the card legend. */
export interface ChartSeriesSpec {
  name: string
}

/** A chart view's drawable data: point-major rows plus the series/axis labels. */
export interface ChartData {
  kind: ChartKind
  points: ChartPoint[]
  series: ChartSeriesSpec[]
  /** The x-axis label (the category property's name, or "Record" when bucketing by title). */
  xLabel: string
  /** Whether `points[].x` are dates, numbers or category labels — decides the x scale. */
  xAxis: ChartXAxis
  stacked: boolean
  /** The configured reference (gauge goal / composed budget line). */
  target?: number
  /** Sunburst only: each bucket's records as leaf points, keyed by the bucket label. */
  leaves?: Record<string, ChartPoint[]>
  /** Gauge only: the first series read over ALL rows, and the target it is read against. */
  gauge?: { value: number | null; target: number }
  /**
   * Ring only: each bucket's first-series figure as a part of the whole, in the view's
   * own row order, plus the total the shares are read against. Only POSITIVE figures
   * participate — a share of a negative whole is not a reading (as for sankey/sunburst).
   */
  ring?: { slices: { label: string; value: number }[]; total: number }
  /**
   * Heatmap only: one `{ date, value }` cell per calendar day. Absent unless the x
   * property is a DATE — a calendar cannot be read off a category label, and the
   * renderer says so rather than drawing a lie.
   */
  heatmap?: { cells: HeatmapCell[] }
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

/** A bucket of rows reduced to one point: each series aggregated within it (gaps stay gaps). */
function pointOf(x: string, bucketRows: readonly CollectionRow[], series: ResolvedChartConfig['series'], names: string[]): ChartPoint {
  const values: Record<string, number> = {}
  series.forEach((s, i) => {
    const figure = aggregateRows(bucketRows, s.def, s.agg)
    if (figure !== null) values[names[i]] = figure
  })
  return { x, values }
}

/**
 * Derive a chart's points from a collection's ROWS (#111): no `points` are ever
 * stored, they are computed here from the records every time. Rows are bucketed by
 * the x property (first-seen order preserved, so a sorted view charts in its own
 * order) and each series aggregates within its bucket.
 *
 * Pass the ALREADY filter/sort-applied rows (`applyView`): a chart must honour the
 * view's own filter and sort exactly as its table does, and `latest` depends on it.
 */
export function chartDataFromRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  config: ViewChartConfig | undefined
): ChartData {
  const { kind, xDef, xAxis, series, stacked, target } = resolveChartConfig(schema, config)
  const names = series.map((s) => seriesName(s.def, s.agg))

  // Bucket rows by category, keeping first-seen order (the view's own row order). A
  // scatter never merges: every record is its own dot, so the key is the row id.
  const order: string[] = []
  const labels = new Map<string, string>()
  const buckets = new Map<string, CollectionRow[]>()
  for (const row of rows) {
    const label = categoryOf(xDef, row)
    const key = kind === 'scatter' ? row.id : label
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else {
      buckets.set(key, [row])
      labels.set(key, label)
      order.push(key)
    }
  }

  const points = order.map((key) => pointOf(labels.get(key) ?? key, buckets.get(key) ?? [], series, names))
  const data: ChartData = { kind, points, series: names.map((name) => ({ name })), xLabel: xDef?.name ?? 'Record', xAxis, stacked }
  if (target !== undefined) data.target = target

  if (kind === 'sunburst') {
    // The outer ring: each record inside its bucket, read with the same verb (a
    // single row's sum/avg/min/max/latest IS its value; count reads as 1).
    data.leaves = {}
    for (const key of order) {
      const label = labels.get(key) ?? key
      data.leaves[label] = (buckets.get(key) ?? []).map((row) => pointOf(row.title || 'Untitled', [row], series, names))
    }
  }

  if (kind === 'gauge') {
    data.gauge = { value: aggregateRows(rows, series[0].def, series[0].agg), target: target ?? rows.length }
  }

  if (kind === 'ring') {
    // Part of the whole: the first series per bucket, negatives and gaps dropped, and
    // the total they are read against. The slice order is the view's own row order —
    // a ring's reading is the person's, not the chart's (the funnel rule).
    const slices: { label: string; value: number }[] = []
    let total = 0
    for (const point of points) {
      const value = point.values[names[0]]
      if (typeof value !== 'number' || !(value > 0)) continue
      slices.push({ label: point.x, value })
      total += value
    }
    data.ring = { slices, total }
  }

  if (kind === 'heatmap') {
    // A calendar reads by DAY, so the x property must be a date; anything else yields
    // no cells and the renderer shows a notice. Dates are stored as ISO strings, which
    // may carry a time — the calendar day is its first ten characters.
    const cells: HeatmapCell[] = []
    if (xAxis === 'date') {
      for (const point of points) {
        const day = point.x.slice(0, 10)
        if (!ISO_DAY.test(day)) continue
        const value = point.values[names[0]]
        if (typeof value !== 'number') continue
        cells.push({ date: day, value })
      }
    }
    data.heatmap = { cells }
  }

  return data
}
