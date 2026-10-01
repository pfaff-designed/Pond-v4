/**
 * Chart derivation for the `chart` view mode (#111 / #94) — the rows of a
 * collection AGGREGATED into drawable points at read time. Split from
 * `aggregate.ts` (which keeps the verbs and the big number) so each file stays
 * small; both are pure, server-safe, and shared by the renderer and `serialize`.
 *
 * Every one of the eleven kinds reads the same `ChartData`: point-major
 * `{ x, values }` rows bucketed by the x property. Three kinds need one extra
 * reading, derived here so the renderers stay dumb:
 * - **scatter** keeps one point PER RECORD (no bucket merge) — each dot a night.
 * - **sunburst** carries each bucket's records as `leaves` — the outer ring.
 * - **gauge** reads ONE figure over all rows against a `target` (the record count
 *   when none is configured — "14 of 24").
 */
import { coerceValue, optionForValue, type PropertyDef, type PropertySchema } from '@/lib/properties/schema'
import type { ChartPoint } from '../chart/data'
import type { ViewChartConfig } from './schema'
import type { CollectionRow } from './apply'
import { aggregateRows, defById, firstNumericDef, seriesName, type ChartKind, type ViewAgg } from './aggregate'

/** The first property that reads as a category/x axis: a date, then a choice, then text. */
function firstCategoryDef(schema: PropertySchema): PropertyDef | undefined {
  return (
    schema.find((d) => d.type === 'date') ??
    schema.find((d) => d.type === 'select' || d.type === 'status') ??
    schema.find((d) => d.type === 'text')
  )
}

export interface ResolvedChartConfig {
  kind: ChartKind
  xDef?: PropertyDef
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
  return { kind, xDef, series, stacked: config?.stacked ?? false, target: config?.target }
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
  stacked: boolean
  /** The configured reference (gauge goal / composed budget line). */
  target?: number
  /** Sunburst only: each bucket's records as leaf points, keyed by the bucket label. */
  leaves?: Record<string, ChartPoint[]>
  /** Gauge only: the first series read over ALL rows, and the target it is read against. */
  gauge?: { value: number | null; target: number }
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
  const { kind, xDef, series, stacked, target } = resolveChartConfig(schema, config)
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
  const data: ChartData = { kind, points, series: names.map((name) => ({ name })), xLabel: xDef?.name ?? 'Record', stacked }
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

  return data
}
