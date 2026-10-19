import { z } from 'zod'
import { labelledBlockFields, type ModuleDescriptor } from '../types'
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
 * are property ids; `collectionId` a page id) already exists, the AI never mints a
 * REFERENCE id here. It does mint one id of its own kind (KAN-32): each entry in
 * `views[]` gets an id at hydration, declared via `nestedIdPaths: ['views']`.
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
 * (each an aggregation over the same rows, never a second copy of them); list
 * (the dated checklist of 6v) is one more read of the same rows, grouped by due.
 */
export const VIEW_MODES = [
  'table',
  'board',
  'calendar',
  'list',
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
// table-mode view is inert).
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

/**
 * How a chart-mode view is DRAWN (#259): the chart card (axes, legend, the Bklit
 * visual) or the board's compact inline mark — `PondTemplate.dc.html`'s `bars`
 * strip for `kind: 'bar'` and its `heat` grid for `kind: 'heatmap'`. Neither is a
 * block type: both aggregate the same records the card does (ADR 0007). Kinds with
 * no compact mark draw the card whatever this says (`COMPACT_CHART_MARK`).
 *
 * A presentation flag, named for what it is in the product — not for the template
 * that sets it: the tracker, dashboard and habit templates write `'compact'` at
 * instantiation (#261) and the block never looks its template up again (ADR 0005).
 * Optional, defaulting to the card, so every persisted chart view parses and draws
 * exactly as before.
 */
export const CHART_PRESENTATIONS = ['card', 'compact'] as const
export const chartPresentationSchema = z.enum(CHART_PRESENTATIONS)
export type ViewChartPresentation = z.infer<typeof chartPresentationSchema>

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
  target: z.number().finite().optional(),
  /** The card or the board's compact inline mark (#259). Omitted → the card. */
  presentation: chartPresentationSchema
    .optional()
    .describe(
      'How the chart is drawn. Omit (or "card") for the full chart with axes and legend. "compact" draws the small inline mark a dashboard, tracker or habit page places beside its big number: a 72px bar strip for kind "bar", a 12-week grid of day cells for kind "heatmap". Other kinds ignore it.'
    ),
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

/**
 * A saved view's own config (KAN-32): the same per-mode clauses `viewSchema` has
 * always carried at the top level, scoped to one view instead of the whole block.
 */
export const viewSavedViewConfigSchema = z.object({
  groupBy: z.string().optional(),
  sort: viewSortSchema.optional(),
  filter: viewFilterSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  chart: viewChartConfigSchema.optional(),
  bigNumber: viewBigNumberConfigSchema.optional(),
  collectionId: z.string().optional(),
})
export type ViewSavedViewConfig = z.infer<typeof viewSavedViewConfigSchema>

/**
 * One saved view in a block's `views[]` (KAN-32): its `kind` plus its own config.
 * KAN-519 may write `kind` in place through `applyConfigPatch` (same id; `label`
 * stays). `configure_view` still does not flip one saved view onto another kind.
 */
export const viewSavedViewSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  kind: viewModeSchema,
  config: viewSavedViewConfigSchema.optional(),
})
export type ViewSavedView = z.infer<typeof viewSavedViewSchema>

// `label` (#258) is the shared mixin from `types.ts`: the board's eyebrow for the view
// (`kanban → tasks — board`, `gantt → tasks — timeline`, `number → this week`,
// `gallery → records`, `bars → by week`, `heat → every day`) — every view-shaped
// block in the twelve templates carries one. `blockFrame()` reads it over the
// mode's name. It is config like everything else here: no id, nothing to strip.
export const viewSchema = z
  .object({
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
    /**
     * Several saved views of the same database (KAN-32). Optional: a block with no
     * `views` is the back-compat shape above (one view, built from `mode`+config)
     * — read it through `resolveActiveView`, never `mode`/`groupBy`/etc. directly.
     */
    views: z.array(viewSavedViewSchema).optional(),
    /** Which of `views` is showing. Stale or missing → `views[0]` (`resolveActiveView`). */
    activeViewId: z.string().optional(),
  })
  .extend(labelledBlockFields)
export type ViewBlock = z.infer<typeof viewSchema>

/**
 * The one view a `ViewBlock` is currently showing (KAN-32). A legacy block (no
 * `views`) synthesizes its single view from the top-level `mode`+config — the
 * exact shape every reader used before `views[]` existed. A `views`-shaped block
 * reads `activeViewId`, falling back to `views[0]` when it is missing or stale
 * (e.g. the active view was deleted).
 */
export const resolveActiveView = (
  block: ViewBlock
): { id: string; label?: string; kind: ViewMode; config: ViewSavedViewConfig } => {
  if (!block.views || block.views.length === 0) {
    return {
      id: block.id,
      label: block.label,
      kind: block.mode,
      config: {
        groupBy: block.groupBy,
        sort: block.sort,
        filter: block.filter,
        startDate: block.startDate,
        endDate: block.endDate,
        chart: block.chart,
        bigNumber: block.bigNumber,
        collectionId: block.collectionId,
      },
    }
  }
  const active = block.views.find((view) => view.id === block.activeViewId) ?? block.views[0]
  return { id: active.id, label: active.label, kind: active.kind, config: active.config ?? {} }
}

/**
 * A `ViewBlock` whose mode/config fields mirror the resolved active view (KAN-321),
 * for a caller that needs a `ViewBlock`-shaped value rather than `resolveActiveView`'s
 * `{ kind, config }` pair — `block-frame.ts` and `BlockCanvas`'s fetch both read
 * `mode`/`filter`/`collectionId` off a block, so they get one here instead of
 * re-deriving the mirror themselves. `selectedId` is the bar's LOCAL selection
 * (KAN-32 fix), which can diverge from the persisted `activeViewId`; omitted, this
 * falls back to `activeViewId`, then `views[0]` — the same order `resolveActiveView`
 * uses. A legacy block (no `views`) returns a copy of itself.
 */
export const activeSavedView = (block: ViewBlock, selectedId?: string): ViewBlock => {
  const resolved = resolveActiveView(
    block.views && selectedId ? { ...block, activeViewId: selectedId } : block
  )
  return {
    ...block,
    mode: resolved.kind,
    groupBy: resolved.config.groupBy,
    sort: resolved.config.sort,
    filter: resolved.config.filter,
    startDate: resolved.config.startDate,
    endDate: resolved.config.endDate,
    chart: resolved.config.chart,
    bigNumber: resolved.config.bigNumber,
    collectionId: resolved.config.collectionId,
  }
}

/**
 * Writes a config patch onto a `ViewBlock` (KAN-32). A legacy block (no `views`)
 * patches the top-level fields exactly as the old `{ ...data, ...patch }` spread
 * did. A `views`-shaped block patches ONLY the active view's `config` — every
 * other view's `config`, and `activeViewId` itself, pass through untouched. This
 * is what replaces the retired "flipping mode back and forth never loses a
 * setup" tolerance: each view now keeps its own config permanently, instead of
 * the block hoarding every mode's leftover fields.
 *
 * An optional `mode` (KAN-519) writes the kind in place: top-level `mode` on a
 * legacy block (`views` stays absent), or `kind` on the active saved view (local
 * `activeId`, else `activeViewId`, else `views[0]` — same id, `label` and sibling
 * views stay, top-level `mode` stays). Other fields in that patch still follow the
 * write above. The same mode, with no other fields, returns the same block. A
 * patch with no `mode` is the write above.
 */
export const applyConfigPatch = (
  block: ViewBlock,
  patch: Partial<ViewSavedViewConfig> & { mode?: ViewMode },
  /** The view actually showing (KAN-32 fix): the LOCAL selection a person's bar
   *  click lands on, which can diverge from the persisted `activeViewId` — a
   *  caller with no local selection (or a legacy block) omits it. */
  activeId?: string
): ViewBlock => {
  if (patch.mode === undefined) {
    if (!block.views || block.views.length === 0) {
      return { ...block, ...patch }
    }
    const target = activeId ?? block.activeViewId ?? block.views[0].id
    return {
      ...block,
      views: block.views.map((view) =>
        view.id === target ? { ...view, config: { ...view.config, ...patch } } : view
      ),
    }
  }

  const { mode, ...config } = patch
  const writesConfig = Object.keys(config).length > 0

  if (!block.views || block.views.length === 0) {
    if (mode === block.mode && !writesConfig) return block
    return { ...block, ...config, mode }
  }

  const target = activeId ?? block.activeViewId ?? block.views[0].id
  const active = block.views.find((view) => view.id === target)
  if (active && mode === active.kind && !writesConfig) return block

  return {
    ...block,
    views: block.views.map((view) => {
      if (view.id !== target) return view
      if (!writesConfig) return { ...view, kind: mode }
      return { ...view, kind: mode, config: { ...view.config, ...config } }
    }),
  }
}

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
 * The config clauses one view's `kind`+config serialize to — shared by the
 * legacy top-level shape and every saved view in `views[]` (KAN-32), so a
 * views-shaped block's per-view clauses can never drift from how the same
 * config read off the top level.
 */
function viewConfigClauses(kind: ViewMode, config: ViewSavedViewConfig): string[] {
  const cfg: string[] = [kind]
  // #259: a CLAUSE, not a separator baked into cfg[0] — `cfg` is joined with
  // ', ' by the caller, so writing the separator in here would silently break
  // if that join ever changed (#259 review). Absent or 'card' adds nothing,
  // which is what keeps a legacy view's serialized string byte-identical.
  if (kind === 'chart' && config.chart) {
    cfg[0] = `chart ${config.chart.kind}`
    if (config.chart.presentation === 'compact') cfg.push('compact')
  }
  if (config.groupBy) cfg.push(`grouped by ${config.groupBy}`)
  if (config.sort) cfg.push(`sorted by ${config.sort.key} ${config.sort.dir}`)
  if (config.filter)
    cfg.push(`filtered ${config.filter.property} ${config.filter.op} ${config.filter.value}`)
  if (kind === 'big-number' && config.bigNumber)
    cfg.push(`${AGG_LABELS[config.bigNumber.agg].toLowerCase()} figure`)
  if (config.collectionId) cfg.push(`linked collection ${config.collectionId}`)
  return cfg
}

/**
 * Aggregate-and-word a chart / big-number view for `serialize` (#111 AC 8). The
 * figures come from the same `aggregate.ts` functions the renderer calls, so the
 * prompt body and embedding can never disagree with the screen. Returns null when
 * the hydration seam gave us no schema/values to read — then serialize falls back to
 * naming the rows, which is honest rather than inventing a figure. Takes the
 * ACTIVE view's own `kind`+config (KAN-32) rather than the whole block, so a
 * views-shaped block's figure always matches what the person is looking at,
 * never a stale top-level mirror.
 */
function serializeFigures(
  kind: ViewMode,
  config: ViewSavedViewConfig,
  rowsIn: readonly ViewRow[],
  schema: PropertySchema | undefined
): string | null {
  if (!schema) return null
  const rows = rowsIn.map((r) => ({
    id: r.id,
    title: r.title,
    values: r.values ?? {},
  }))

  if (kind === 'big-number') {
    const figure = bigNumberFromRows(rows, schema, config.bigNumber)
    const delta = figure.delta === undefined ? '' : ` (${signedDelta(figure.delta)})`
    return `${figure.label}: ${figure.formatted}${delta} over ${rows.length} record${
      rows.length === 1 ? '' : 's'
    }`
  }

  const chart = chartDataFromRows(rows, schema, config.chart)
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
  // A view has no single face (ADR 0007: seven modes), so the `/` menu offers its
  // MODES as rows — gallery, chart, big number — and withholds a plain `view` row.
  label: 'view',
  schema: viewSchema,
  description:
    "An inline view that displays a collection's rows (its type='row' child pages, #18) as a table, board, calendar, gallery, gantt (a read-only timeline over Start→End date properties), chart, or big-number. Use ONLY on a page that is a collection (has a property schema) or that has row children. `mode` picks the layout; `groupBy` (a select/status property id) buckets a board; `sort` and a single `filter` clause reference existing property ids; `startDate`/`endDate` (date property ids) place gantt bars; `chart` (kind + xProperty + series) and `bigNumber` (property + agg) AGGREGATE the rows at read time — a chart or headline figure never holds its own copy of the data, which is why there are no standalone chart/stat blocks to create. `chart.presentation: 'compact'` draws kind 'bar' as a small inline bar strip and kind 'heatmap' as a 12-week grid of day cells, with no axes — the at-a-glance mark a dashboard, tracker or habit page places beside its big number; leave it off for a full chart card. Do not use to lay out ordinary prose — that's a text block.",
  // Serialize the CONFIG in full (the AI re-emits it, so every clause must be
  // visible) plus the hydrated row titles for context fidelity. Rows arrive on the
  // transient HydratedViewBlock the assemble seam builds; absent that injection
  // (e.g. a bare block passed to blocksToText), a view honestly renders "no rows".
  // A chart/big-number view leads with its AGGREGATED figures instead of row titles
  // (#111 AC 8) — the figure IS what the user sees, so it is what the model must read.
  //
  // A views-shaped block (KAN-32) names EVERY saved view, not just the active one:
  // a saved view the model can't see here is a saved view its next wholesale `edit`
  // drops (types.ts's `serialize` contract). The row/figure tail still reads off
  // the ACTIVE view alone — that's the one render a person or the model is looking at.
  serialize: (data) => {
    const rows = (data as HydratedViewBlock).rows ?? []
    const active = resolveActiveView(data)

    const head =
      data.views && data.views.length > 0
        ? `View — ${data.views
            .map((view) => {
              const clauses = viewConfigClauses(view.kind, view.config ?? {})
              const label = view.label ?? view.kind
              const marker = view.id === active.id ? ' (active)' : ''
              return `${label}${marker} (${clauses.join(', ')})`
            })
            .join('; ')}`
        : `View (${viewConfigClauses(active.kind, active.config).join(', ')})`

    if (active.kind === 'chart' || active.kind === 'big-number') {
      const figures = serializeFigures(
        active.kind,
        active.config,
        rows,
        (data as HydratedViewBlock).schema
      )
      if (figures) return `${head} — ${figures}`
    }

    if (rows.length === 0) return `${head} — no rows`
    const titles = rows.map((r) => r.title || 'Untitled').join(', ')
    return `${head} — ${rows.length} row${rows.length === 1 ? '' : 's'}: ${titles}`
  },
  // The one minted child id (KAN-32): each saved view's own `id` in `views[]`.
  // Everything else config references already exists (property/page ids), and
  // rows are child pages hydrated at read time — never part of the persisted
  // block.
  nestedIdPaths: ['views'],
}
