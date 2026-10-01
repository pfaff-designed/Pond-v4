import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import type { PropertySchema } from '@/lib/properties/schema'
import { AGG_LABELS, CHART_KINDS, VIEW_AGGS, bigNumberFromRows, signedDelta } from './aggregate'
import { chartDataFromRows } from './chart-data'

/**
 * The `view` block (#19) — an inline block that DRAWS a collection's rows.
 *
 * A view is pure *config*: which render `mode`, and an optional single-clause
 * `filter`, single-key `sort`, and `groupBy` (decision 15 — compound filters
 * deferred). It carries NO rows of its own. The rows are the collection page's
 * `type='row'` children (#18), fetched and injected before `serialize` runs — the
 * read-hydration seam in `assemble.ts` (decision 16). Because the persisted block
 * is config-only and every id it references (`groupBy`/`sort.key`/`filter.property`
 * are property ids; `collectionId` a page id) already exists, the AI never mints an
 * id here — so there are no `nestedIdPaths` and the emit shape is a flat id strip.
 *
 * A view renders its OWN page's rows by default; when `collectionId` is set it is a
 * LINKED view (#41) that draws ANOTHER collection's rows instead. Both are hydrated
 * the same way — the assemble seam injects the source collection's rows before
 * `serialize` runs, and the client renderer fetches them via `useCollectionRows`.
 *
 * #111 widened the primitive: a CHART and a BIG NUMBER are modes of this same block,
 * not blocks of their own. The design law is "a view is a block that shows a
 * database: table, gallery, board, timeline, chart or big number… the record is the
 * source of truth… nothing holds a copy" — so a chart's points and a headline figure
 * are AGGREGATED from the rows at read time (`aggregate.ts`), never stored. That is
 * what retires the old standalone `chart-*`/`stat`/`metric*`/`heatmap`/`timeline`
 * blocks from creation: each of those held its own copy of the data.
 */

/**
 * The render modes (decision 13). table/board landed in slice 3; calendar (agenda) +
 * gallery in slice 4; gantt (read-only timeline) in #27; chart + big-number in #111
 * (each an aggregation over the same rows, never a second copy of them).
 */
export const VIEW_MODES = [
  'table',
  'board',
  'calendar',
  'gallery',
  'gantt',
  'chart',
  'big-number',
] as const
export const viewModeSchema = z.enum(VIEW_MODES)
export type ViewMode = z.infer<typeof viewModeSchema>

/** Single-clause filter operators (decision 15). Kept small and property-typed on purpose. */
export const FILTER_OPS = ['eq', 'neq', 'contains', 'gt', 'lt'] as const
export const filterOpSchema = z.enum(FILTER_OPS)
export type FilterOp = z.infer<typeof filterOpSchema>

/** Single-key sort: a property id + direction. */
export const viewSortSchema = z.object({
  key: z.string(),
  dir: z.enum(['asc', 'desc']),
})
export type ViewSort = z.infer<typeof viewSortSchema>

/** Single-clause filter: property id `op` a scalar value (string; renderer coerces per type). */
export const viewFilterSchema = z.object({
  property: z.string(),
  op: filterOpSchema,
  value: z.string(),
})
export type ViewFilter = z.infer<typeof viewFilterSchema>

// ── chart + big-number mode config (#111) ────────────────────────────────────
//
// Mode-specific config, read ONLY for the matching mode (a leftover `chart` on a
// table-mode view is inert, so flipping mode back and forth never loses a setup).
// Neither block can be *required* by its mode: `viewSchema` is a member of the
// `blockSchema` discriminated union, which cannot carry a cross-field refinement —
// so mode-without-config is structurally valid and `aggregate.ts` INFERS a drawable
// config from the collection's schema instead (the same tolerance as a `board` with
// no `groupBy`, or a gantt inferring its date properties). What IS rejected here is
// a MALFORMED config: an unknown chart kind, an empty series list, a bogus verb.

/** The aggregation verb vocabulary (shared with rollups — see `aggregate.ts`). */
export const viewAggSchema = z.enum(VIEW_AGGS)
export type ViewAggValue = z.infer<typeof viewAggSchema>

/** How a figure renders. `percent` treats the value as a FRACTION (0.62 → "62%"). */
export const viewFigureFormatSchema = z.enum(['number', 'currency', 'percent'])
export type ViewFigureFormat = z.infer<typeof viewFigureFormatSchema>

/** Every chart KIND (#94). These are `kind` VALUES of the chart mode, NOT block types. */
export const chartKindSchema = z.enum(CHART_KINDS)
export type ViewChartKind = z.infer<typeof chartKindSchema>

/** One plotted series: which property, read with which verb. */
export const viewChartSeriesSchema = z.object({
  /** The id of the property to plot. `agg: 'count'` may name any property (it counts rows). */
  property: z.string(),
  agg: viewAggSchema,
})
export type ViewChartSeries = z.infer<typeof viewChartSeriesSchema>

/** Chart-mode config: which kind, bucketed by which property, plotting which series. */
export const viewChartConfigSchema = z.object({
  kind: chartKindSchema,
  /** The id of the property that buckets the x/category axis. Omitted → one point per record. */
  xProperty: z.string().optional(),
  /** At least one series — a chart with nothing plotted is a config bug, not a state. */
  series: z.array(viewChartSeriesSchema).min(1),
  /** Stack the series instead of grouping them (multi-series bar/area). */
  stacked: z.boolean().optional(),
  /**
   * A reference figure (#94): the goal a GAUGE fills toward (omitted → the record
   * count, "14 of 24"), or the dashed target line on a COMPOSED chart. Never data —
   * one number the person sets, like a filter value.
   */
  target: z.number().optional(),
})
export type ViewChartConfig = z.infer<typeof viewChartConfigSchema>

/**
 * A big number's optional compare, as ONE clause (like a filter, decision 15): the
 * aggregate over the rows whose `property` equals `value`, against the aggregate over
 * the rest — rendered as a signed percentage change.
 */
export const viewDeltaConfigSchema = z.object({
  property: z.string(),
  value: z.string(),
})
export type ViewDeltaConfig = z.infer<typeof viewDeltaConfigSchema>

/** Big-number-mode config: one property, read with one verb, formatted one way. */
export const viewBigNumberConfigSchema = z.object({
  /** The id of the property to aggregate. Omitted with `agg: 'count'` = count of records. */
  property: z.string().optional(),
  agg: viewAggSchema,
  format: viewFigureFormatSchema.optional(),
  delta: viewDeltaConfigSchema.optional(),
})
export type ViewBigNumberConfig = z.infer<typeof viewBigNumberConfigSchema>

export const viewSchema = z.object({
  id: z.string(),
  type: z.literal('view'),
  mode: viewModeSchema,
  /** Board group-by: the id of the select/status property to bucket rows under. */
  groupBy: z.string().optional(),
  sort: viewSortSchema.optional(),
  filter: viewFilterSchema.optional(),
  /** Gantt (#27): the id of the `date` property a bar STARTS at. Omitted → inferred (1st date prop). */
  startDate: z.string().optional(),
  /** Gantt (#27): the id of the `date` property a bar ENDS at. Omitted → inferred (2nd date prop); none → single-day bars. */
  endDate: z.string().optional(),
  /** Chart mode (#111): which kind, bucketed by which property, plotting which series. */
  chart: viewChartConfigSchema.optional(),
  /** Big-number mode (#111): the one figure this view leads with. */
  bigNumber: viewBigNumberConfigSchema.optional(),
  /** A linked view over ANOTHER collection (#41) — draws that collection's rows instead of the host page's. */
  collectionId: z.string().optional(),
})
export type ViewBlock = z.infer<typeof viewSchema>

/**
 * A row injected into a view block by the `assemble.ts` hydration seam (decision
 * 16) — the collection page's `type='row'` children reduced to what serialize
 * needs. NOT persisted: the view block's own schema is config-only, so `rows`
 * lives only on the transient `HydratedViewBlock` the assemble path builds before
 * calling `serialize`. Slice 2 renders titles; the renderers (slices 3–4) resolve
 * per-row property values.
 *
 * `values` (#111) carries the row's typed property values, so `serialize` can run the
 * SAME aggregation the screen shows — the AI's context has to read the user-visible
 * figure, not a promise that a chart exists.
 */
export interface ViewRow {
  id: string
  title: string
  /** The row's property value map (`props` minus `_schema`). Absent on a title-only hydrate. */
  values?: Record<string, unknown>
}

/**
 * A view block with its rows attached for serialization/render. Transient, never
 * persisted. `schema` is the SOURCE collection's property schema — needed (with
 * `values`) to aggregate chart/big-number modes at serialize time.
 */
export type HydratedViewBlock = ViewBlock & {
  rows?: readonly ViewRow[]
  schema?: PropertySchema
}

/**
 * Aggregate-and-word a chart / big-number view for `serialize` (#111 AC 8). The
 * figures come from the same `aggregate.ts` functions the renderer calls, so the
 * prompt body and embedding can never disagree with the screen. Returns null when
 * the hydration seam gave us no schema/values to read — then serialize falls back to
 * naming the rows, which is honest rather than inventing a figure.
 */
function serializeFigures(data: HydratedViewBlock): string | null {
  const schema = data.schema
  if (!schema) return null
  const rows = (data.rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    values: r.values ?? {},
  }))

  if (data.mode === 'big-number') {
    const figure = bigNumberFromRows(rows, schema, data.bigNumber)
    const delta = figure.delta === undefined ? '' : ` (${signedDelta(figure.delta)})`
    return `${figure.label}: ${figure.formatted}${delta} over ${rows.length} record${
      rows.length === 1 ? '' : 's'
    }`
  }

  const chart = chartDataFromRows(rows, schema, data.chart)
  if (chart.points.length === 0) return 'no records to chart'
  if (chart.gauge) {
    const v = chart.gauge.value === null ? '—' : String(chart.gauge.value)
    return `gauge: ${chart.series[0].name} ${v} of ${chart.gauge.target} over ${rows.length} record${
      rows.length === 1 ? '' : 's'
    }`
  }
  const perSeries = chart.series.map((s) => {
    const pairs = chart.points
      .map((p) => {
        const v = p.values[s.name]
        return v === undefined ? null : `${p.x} ${v}`
      })
      .filter((x): x is string => x !== null)
    return `${s.name}: ${pairs.length ? pairs.join(', ') : '(no values)'}`
  })
  return `${chart.kind} by ${chart.xLabel}; ${perSeries.join('; ')}`
}

export const viewDescriptor: ModuleDescriptor<ViewBlock> = {
  type: 'view',
  schema: viewSchema,
  paletteDescription:
    "An inline table, board, calendar, gallery, gantt, chart, or big number of a collection's pages.",
  description:
    "An inline view that displays a collection's rows (its type='row' child pages, #18) as a table, board, calendar, gallery, gantt (a read-only timeline over Start→End date properties), chart, or big-number. Use ONLY on a page that is a collection (has a property schema) or that has row children. `mode` picks the layout; `groupBy` (a select/status property id) buckets a board; `sort` and a single `filter` clause reference existing property ids; `startDate`/`endDate` (date property ids) place gantt bars; `chart` (kind + xProperty + series) and `bigNumber` (property + agg) AGGREGATE the rows at read time — a chart or headline figure never holds its own copy of the data, which is why there are no standalone chart/stat blocks to create. Do not use to lay out ordinary prose — that's a text block.",
  // Serialize the CONFIG in full (the AI re-emits it, so every clause must be
  // visible) plus the hydrated row titles for context fidelity. Rows arrive on the
  // transient HydratedViewBlock the assemble seam builds; absent that injection
  // (e.g. a bare block passed to blocksToText), a view honestly renders "no rows".
  // A chart/big-number view leads with its AGGREGATED figures instead of row titles
  // (#111 AC 8) — the figure IS what the user sees, so it is what the model must read.
  serialize: (data) => {
    const rows = (data as HydratedViewBlock).rows ?? []
    const cfg: string[] = [data.mode]
    if (data.mode === 'chart' && data.chart) cfg[0] = `chart ${data.chart.kind}`
    if (data.groupBy) cfg.push(`grouped by ${data.groupBy}`)
    if (data.sort) cfg.push(`sorted by ${data.sort.key} ${data.sort.dir}`)
    if (data.filter)
      cfg.push(`filtered ${data.filter.property} ${data.filter.op} ${data.filter.value}`)
    if (data.mode === 'big-number' && data.bigNumber)
      cfg.push(`${AGG_LABELS[data.bigNumber.agg].toLowerCase()} figure`)
    if (data.collectionId) cfg.push(`linked collection ${data.collectionId}`)
    const head = `View (${cfg.join(', ')})`

    if (data.mode === 'chart' || data.mode === 'big-number') {
      const figures = serializeFigures(data as HydratedViewBlock)
      if (figures) return `${head} — ${figures}`
    }

    if (rows.length === 0) return `${head} — no rows`
    const titles = rows.map((r) => r.title || 'Untitled').join(', ')
    return `${head} — ${rows.length} row${rows.length === 1 ? '' : 's'}: ${titles}`
  },
  // No minted child ids: config references existing property/page ids, and rows
  // are child pages hydrated at read time — never part of the persisted block.
}
