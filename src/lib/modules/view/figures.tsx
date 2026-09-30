'use client'

/**
 * The two AGGREGATE view modes (#111) — `chart` and `big-number`, plus the controls
 * that configure them.
 *
 * They live beside `view.tsx` rather than inside it because they answer a different
 * question from the other modes: table / board / calendar / gallery / gantt all PLACE
 * records, while these two READ them — every number here is computed by `aggregate.ts`
 * from the collection's rows at render time. The design law is the reason there is
 * nothing else to keep: "the record is the source of truth… nothing holds a copy."
 *
 * Only line / area / bar have renderers today; the other eight #94 kinds are valid
 * config that reads as a calm notice, so #94 lands renderers without touching the
 * persisted contract.
 */

import { useMemo } from 'react'
import type { ViewBlock } from './schema'
import type { CollectionRow } from './apply'
import {
  AGG_LABELS,
  CHART_KINDS,
  VIEW_AGGS,
  bigNumberFromRows,
  chartDataFromRows,
  figureFormatOptions,
  isDrawnChartKind,
  resolveChartConfig,
  signedDelta,
  type ChartKind,
  type ViewAgg,
} from './aggregate'
import { ViewNotice } from './notice'
import { toChartRows } from '../chart/data'
import { ChartCard, CHART_SERIES_COLORS, KICKER } from '../chart/card'
import type { PropertySchema } from '@/lib/properties/schema'
import { ChartStatFlow } from '@/components/charts/chart-stat-flow'
import { LineChart, Line } from '@/components/charts/line-chart'
import { AreaChart } from '@/components/charts/area-chart'
import { Area } from '@/components/charts/area'
import { BarChart } from '@/components/charts/bar-chart'
import { Bar } from '@/components/charts/bar'
import { Grid } from '@/components/charts/grid'

/** The shared terse `<select>` shell every view control uses. */
export function ControlSelect({
  label,
  aria,
  value,
  onChange,
  children,
}: {
  /** The visible, terse label beside the select. */
  label: string
  /** The accessible name, when it should read fuller than the visible label. */
  aria?: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-mn-text-secondary">
      {label}
      <select
        aria-label={aria ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-mn-chrome shadow-mn-sm bg-transparent px-1 py-0.5 text-xs text-mn-text outline-none"
      >
        {children}
      </select>
    </label>
  )
}

/** The aggregation-verb options, shared by the chart series and the big-number figure. */
function aggOptions() {
  return VIEW_AGGS.map((a) => (
    <option key={a} value={a}>
      {AGG_LABELS[a]}
    </option>
  ))
}

/**
 * Chart-mode config (#111): which KIND, which property buckets the x axis, and which
 * property is plotted with which verb. Single-series on purpose — the same restraint
 * as the single-clause filter (decision 15); a second series is a real multi-series
 * gesture, not a checkbox, and lands with the #94 renderers.
 *
 * Every change rewrites the whole `chart` config, so a half-configured chart can't
 * exist: the picker always emits a complete `{ kind, xProperty, series }`.
 */
export function ChartControls({
  config,
  schema,
  onConfigChange,
}: {
  config: ViewBlock
  schema: PropertySchema
  onConfigChange: (patch: Partial<ViewBlock>) => void
}) {
  const inferred = resolveChartConfig(schema, config.chart)
  const seriesProp = config.chart?.series[0]
  const write = (patch: Partial<NonNullable<ViewBlock['chart']>>) =>
    onConfigChange({
      chart: {
        kind: config.chart?.kind ?? inferred.kind,
        xProperty: config.chart?.xProperty,
        series: config.chart?.series ?? [{ property: '', agg: 'count' }],
        ...patch,
      },
    })

  return (
    <>
      <ControlSelect
        label="Chart"
        value={config.chart?.kind ?? inferred.kind}
        onChange={(v) => write({ kind: v as ChartKind })}
      >
        {CHART_KINDS.map((k) => (
          <option key={k} value={k}>
            {k.charAt(0).toUpperCase() + k.slice(1)}
            {isDrawnChartKind(k) ? '' : ' (soon)'}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="By"
        value={config.chart?.xProperty ?? ''}
        onChange={(v) => write({ xProperty: v || undefined })}
      >
        <option value="">Each record</option>
        {schema.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="Plot"
        value={seriesProp?.property ?? ''}
        onChange={(v) => write({ series: [{ property: v, agg: seriesProp?.agg ?? 'sum' }] })}
      >
        <option value="">Record count</option>
        {schema.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="as"
        value={seriesProp?.agg ?? 'sum'}
        onChange={(v) =>
          write({ series: [{ property: seriesProp?.property ?? '', agg: v as ViewAgg }] })
        }
      >
        {aggOptions()}
      </ControlSelect>
    </>
  )
}

/**
 * Big-number-mode config (#111): the ONE property this page's figure reads, its verb,
 * and its format. This is the mode a data page leads with (#94's "one oversized figure,
 * not a chart"), so its config stays to three choices.
 */
export function BigNumberControls({
  config,
  schema,
  onConfigChange,
}: {
  config: ViewBlock
  schema: PropertySchema
  onConfigChange: (patch: Partial<ViewBlock>) => void
}) {
  const current = config.bigNumber
  const write = (patch: Partial<NonNullable<ViewBlock['bigNumber']>>) =>
    onConfigChange({
      bigNumber: {
        property: current?.property,
        agg: current?.agg ?? 'sum',
        format: current?.format,
        delta: current?.delta,
        ...patch,
      },
    })

  return (
    <>
      <ControlSelect
        label="Figure"
        value={current?.property ?? ''}
        onChange={(v) => write({ property: v || undefined, ...(v ? {} : { agg: 'count' }) })}
      >
        <option value="">Record count</option>
        {schema.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="as"
        value={current?.agg ?? 'sum'}
        onChange={(v) => write({ agg: v as ViewAgg })}
      >
        {aggOptions()}
      </ControlSelect>

      <ControlSelect
        label="Format"
        value={current?.format ?? 'number'}
        onChange={(v) => write({ format: v as NonNullable<ViewBlock['bigNumber']>['format'] })}
      >
        <option value="number">Number</option>
        <option value="currency">Currency</option>
        <option value="percent">Percent</option>
      </ControlSelect>
    </>
  )
}

// ── Chart + big-number modes (#111) ───────────────────────────────────────────

/**
 * Chart mode — the collection's rows AGGREGATED into a chart at read time.
 *
 * Nothing is stored: `chartDataFromRows` buckets the (already filtered + sorted) rows
 * by the x property and aggregates each series within a bucket, so editing a record in
 * the table view moves this chart on the next read. That is the #111 law — "the record
 * is the source of truth… nothing holds a copy".
 *
 * Only line / area / bar have renderers today; the other eight #94 kinds are valid
 * config that reads as a calm "not drawn yet" rather than a crash or a silent fallback
 * to the wrong shape — so #94 adds renderers without touching this contract.
 */
export function CollectionChart({
  schema,
  rows,
  chart,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  chart?: ViewBlock['chart']
}) {
  const data = useMemo(() => chartDataFromRows(rows, schema, chart), [rows, schema, chart])
  const names = data.series.map((s) => s.name)
  const chartRows = toChartRows(data.points)

  if (!isDrawnChartKind(data.kind)) {
    return <ViewNotice>A {data.kind} chart isn’t drawn yet.</ViewNotice>
  }

  const common = {
    data: chartRows,
    xDataKey: 'x',
    aspectRatio: '5 / 2',
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
  } as const

  return (
    <ChartCard
      xLabel={data.xLabel}
      yLabel={names.join(' · ')}
      points={data.points}
      seriesColors={CHART_SERIES_COLORS}
    >
      {data.kind === 'line' ? (
        <LineChart {...common}>
          <Grid />
          {names.map((name, i) => (
            <Line
              key={name}
              dataKey={name}
              stroke={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
              animate={false}
              loading={false}
            />
          ))}
        </LineChart>
      ) : data.kind === 'area' ? (
        <AreaChart {...common}>
          <Grid />
          {names.map((name, i) => (
            <Area
              key={name}
              dataKey={name}
              fill={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
              stroke={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
              animate={false}
              loading={false}
            />
          ))}
        </AreaChart>
      ) : (
        // `stacked` only reaches the bar renderer: it is the one visual that supports
        // stacking today. Line/area stacking arrives with #94's multi-series kinds, so
        // the flag stays persisted config there rather than being silently honoured.
        <BarChart {...common} stacked={data.stacked}>
          <Grid />
          {names.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              fill={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
              animate={false}
            />
          ))}
        </BarChart>
      )}
    </ChartCard>
  )
}

/**
 * Big-number mode — ONE oversized figure aggregated from the collection's records.
 *
 * The product stance on #94: "data pages lead with one oversized figure, not a chart."
 * This is that surface, and it is a VIEW, so the figure is always live: change a row's
 * number in the table and this reads the new total, because there is no copy.
 *
 * The plain formatted value rides an aria-label (like the retired `stat` block) so
 * assistive tech and story tests read one stable string while NumberFlow animates the
 * digits underneath.
 */
export function CollectionBigNumber({
  schema,
  rows,
  bigNumber,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  bigNumber?: ViewBlock['bigNumber']
}) {
  const figure = useMemo(() => bigNumberFromRows(rows, schema, bigNumber), [rows, schema, bigNumber])
  const records = `over ${figure.recordCount} record${figure.recordCount === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col items-start py-1 text-mn-text">
      <span role="status" aria-label={`${figure.label}: ${figure.formatted}`}>
        {figure.value === null ? (
          <span aria-hidden className="flex flex-col items-start">
            <span className="text-4xl font-bold tracking-tight tabular-nums text-mn-text">—</span>
            <span className={KICKER}>{figure.label}</span>
          </span>
        ) : (
          <span aria-hidden className="flex flex-col items-start">
            <ChartStatFlow
              value={figure.value}
              label={figure.label}
              formatOptions={figureFormatOptions(bigNumber?.format)}
              valueClassName="text-4xl font-bold tracking-tight text-mn-text tabular-nums"
              labelClassName={KICKER}
            />
          </span>
        )}
      </span>
      {figure.delta !== undefined && (
        <span className="mt-1 font-mono text-xs tabular-nums text-mn-text-secondary">
          {signedDelta(figure.delta)}
        </span>
      )}
      <span className="mt-0.5 text-xs text-mn-text-faint">{records}</span>
    </div>
  )
}
