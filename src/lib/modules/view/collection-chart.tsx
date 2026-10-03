'use client'

/**
 * Chart mode — the PLOTS: the collection's rows AGGREGATED into a chart at read time
 * (#111), drawn by whichever of the thirteen kinds `PondChart.dc.html` declares.
 * The card around them is `collection-chart-card.tsx` → `chart/card.tsx` (#227).
 *
 * Nothing is stored: `chartDataFromRows` buckets the (already filtered + sorted) rows
 * by the x property and aggregates each series within a bucket, so editing a record in
 * the table view moves this chart on the next read. That is the #111 law — "the record
 * is the source of truth… nothing holds a copy". The kind is a VALUE of the view's
 * config, never a block type; switching kinds touches only `chart.kind`.
 */

import type { ChartData } from './chart-data'
import { formatFigure } from './aggregate'
import { toHeatmapGrid } from './heatmap-data'
import { ViewNotice } from './notice'
import { toCategoricalChartRows, toChartRows } from '../chart/data'
import { rankColor, seriesColor } from '@/components/charts/chart-ramp'
import { LineChart, Line } from '@/components/charts/line-chart'
import { AreaChart } from '@/components/charts/area-chart'
import { Area } from '@/components/charts/area'
import { BarChart } from '@/components/charts/bar-chart'
import { Bar } from '@/components/charts/bar'
import { Grid } from '@/components/charts/grid'
import { XAxis } from '@/components/charts/x-axis'
import { BarXAxis } from '@/components/charts/bar-x-axis'
import { ComposedChart } from '@/components/charts/composed'
import { NetChart } from '@/components/charts/net'
import { GaugeChart } from '@/components/charts/gauge'
import { RadarChart, RADAR_MIN_AXES } from '@/components/charts/radar'
import { ScatterChart } from '@/components/charts/scatter'
import { SankeyChart } from '@/components/charts/sankey'
import { SunburstChart } from '@/components/charts/sunburst'
import { FunnelChart } from '@/components/charts/funnel'
import { RingChart } from '@/components/charts/ring-chart'
import { Ring } from '@/components/charts/ring'
import { RingCenter } from '@/components/charts/ring-center'
import { HeatmapChart, HeatmapCells, HeatmapXAxis, HeatmapYAxis } from '@/components/charts/heatmap'

/**
 * The three promoted Bklit visuals, fed the flat row shape they expect. Line and
 * area run on a time scale: a DATE x passes through as dates; a category or number
 * x (#94 — a select, a status, a day name, the record title) becomes evenly spaced
 * ordinals with the label shown as given, so the shell never builds a Date from a
 * category (the `Invalid time value` RangeError that took the page down). Bar is
 * a band scale over the labels already.
 */
function BklitKind({ data, names }: { data: ChartData; names: string[] }) {
  const categorical = data.xAxis !== 'date'
  const common = {
    data: categorical ? toCategoricalChartRows(data.points) : toChartRows(data.points),
    xDataKey: 'x',
    aspectRatio: '5 / 2',
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
  } as const
  const timeSeries = categorical ? { xLabelKey: 'xLabel' } : {}
  if (data.kind === 'line') {
    return (
      <LineChart {...common} {...timeSeries}>
        <Grid />
        <XAxis />
        {names.map((name, i) => (
          <Line key={name} dataKey={name} stroke={seriesColor(i)} animate={false} loading={false} />
        ))}
      </LineChart>
    )
  }
  if (data.kind === 'area') {
    return (
      <AreaChart {...common} {...timeSeries}>
        <Grid />
        <XAxis />
        {names.map((name, i) => (
          <Area
            key={name}
            dataKey={name}
            fill={seriesColor(i)}
            stroke={seriesColor(i)}
            animate={false}
            loading={false}
          />
        ))}
      </AreaChart>
    )
  }
  // `stacked` reaches the bar renderer: it is the one Bklit visual that stacks.
  // Bars take the label strings straight (band scale) — no ordinal needed.
  return (
    <BarChart {...common} data={toChartRows(data.points)} stacked={data.stacked}>
      <Grid />
      <BarXAxis />
      {names.map((name, i) => (
        <Bar key={name} dataKey={name} fill={seriesColor(i)} animate={false} />
      ))}
    </BarChart>
  )
}

/** The ring's drawn size — the mockup's 140 × 150 plot, squared off. */
const RING_SIZE = 150

/**
 * The heatmap's cell PITCH, fixed rather than fluid: the mockup draws 26 weeks across
 * 318px, so a column is ~12px — a 10px cell with a 2px gap. Left fluid, a four-week
 * view would stretch one cell to 288px and stand 2,000px tall.
 */
const HEATMAP_CELL = 10
const HEATMAP_CELL_GAP = 2

/**
 * Ring: the board's "budget share" — `transactions · category, £`. Every bucket is
 * read as a PART OF THE WHOLE: one Bklit ring per share, each against the same total,
 * with the total in the centre (the hovered share replaces it) and a legend beside it.
 * Ranked ink fills, like the sunburst — a part-of-whole is ranked, never categorical.
 */
function RingKind({ data, names, label }: { data: ChartData; names: string[]; label: string }) {
  const ring = data.ring
  if (!ring || ring.slices.length === 0 || ring.total <= 0) {
    return (
      <ViewNotice>
        Nothing to share out yet — a ring needs positive values in “{names[0]}”.
      </ViewNotice>
    )
  }
  const rings = ring.slices.map((slice) => ({ ...slice, maxValue: ring.total }))
  return (
    <div className="mn-arrive flex items-center gap-[18px]">
      <div
        aria-label={label}
        className="flex-none"
        role="img"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <RingChart baseInnerRadius={42} data={rings} ringGap={4} size={RING_SIZE} strokeWidth={9}>
          {rings.map((slice, i) => (
            <Ring
              animate={false}
              color={rankColor(i)}
              index={i}
              key={slice.label}
              showGlow={false}
            />
          ))}
          <RingCenter defaultLabel="total" />
        </RingChart>
      </div>
      <ul className="m-0 flex flex-1 list-none flex-col gap-[7px] p-0">
        {rings.map((slice, i) => (
          <li className="flex items-center gap-2 text-[12.5px] text-mn-text" key={slice.label}>
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ background: rankColor(i) }}
            />
            <span className="flex-1 text-mn-text-meta">{slice.label}</span>
            <span className="font-medium tabular-nums">{formatFigure(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Heatmap: the board's "workouts" — `sessions · date, minutes`. One cell a day over
 * the GitHub-contributions grid, binned from the derived `{ date, value }` cells by
 * `toHeatmapGrid`. A calendar cannot be read off a category label, so a non-date x
 * property reads as a notice that names the fix. Animation is off: the grid must be
 * deterministic in story tests and calm on a dense page.
 */
function HeatmapKind({ data, label }: { data: ChartData; label: string }) {
  const grid = toHeatmapGrid(data.heatmap?.cells ?? [])
  if (grid === null) {
    return <ViewNotice>A heatmap reads one cell a day — pick a date field for “By”.</ViewNotice>
  }
  return (
    <div aria-label={label} role="img">
      <HeatmapChart
        animate={false}
        binSize={HEATMAP_CELL}
        data={grid.columns}
        gap={HEATMAP_CELL_GAP}
        margin={{ top: 24, right: 8, bottom: 0, left: 32 }}
        sizingColumnCount={grid.columns.length}
        xDomain={grid.xDomain}
      >
        <HeatmapCells />
        <HeatmapXAxis />
        <HeatmapYAxis labelFormat="initial" />
      </HeatmapChart>
    </div>
  )
}

/**
 * One renderer per kind. Each PondChart kind reads the same point-major data; the
 * five that need an extra reading (scatter per record, sunburst leaves, gauge figure,
 * ring shares, heatmap cells) get it from `ChartData`, derived in `chart-data.ts`. A
 * kind whose data prerequisite is missing reads as a calm notice that says what to
 * change.
 */
export function ChartKind({ data, names }: { data: ChartData; names: string[] }) {
  const label = `${data.kind} chart of ${names.join(', ')} by ${data.xLabel}`
  // AGENTS.md G6: a kind with nothing drawable reads as a notice, never card chrome
  // around a blank. Each says what the records would need.
  const empty = (
    <ViewNotice>Nothing to draw yet — these records carry no number in “{names[0]}”.</ViewNotice>
  )
  switch (data.kind) {
    case 'line':
    case 'area':
    case 'bar':
      return <BklitKind data={data} names={names} />
    case 'composed':
      return (
        <ComposedChart
          points={data.points}
          series={names}
          target={data.target}
          label={label}
          fallback={empty}
        />
      )
    case 'net':
      return <NetChart points={data.points} series={names} label={label} fallback={empty} />
    case 'heatmap':
      return <HeatmapKind data={data} label={label} />
    case 'ring':
      return <RingKind data={data} names={names} label={label} />
    case 'gauge': {
      if (!data.gauge || data.gauge.value === null) {
        return <ViewNotice>Nothing to read for this gauge — plot a number field.</ViewNotice>
      }
      // "5 of 8 records" when the target is the record count. With a goal the unit is
      // omitted ("12,500 of 20,000"): a series name is rarely a plural noun, and the
      // chart has no access to the collection's own word for its records.
      const unit = data.target === undefined ? 'records' : undefined
      return (
        <GaugeChart value={data.gauge.value} target={data.gauge.target} unit={unit} label={label} />
      )
    }
    case 'radar':
      if (data.points.length < RADAR_MIN_AXES) {
        return (
          <ViewNotice>
            A radar needs at least three categories — pick a “By” field with more values.
          </ViewNotice>
        )
      }
      return <RadarChart points={data.points} series={names} label={label} fallback={empty} />
    case 'scatter':
      return (
        <ScatterChart
          points={data.points}
          series={names}
          axis={data.xAxis === 'number' ? 'numeric' : data.xAxis === 'date' ? 'date' : undefined}
          label={label}
          fallback={empty}
        />
      )
    case 'sankey':
      return (
        <SankeyChart
          points={data.points}
          series={names[0]}
          label={label}
          fallback={
            <ViewNotice>
              Nothing to flow yet — a sankey needs positive values in “{names[0]}”.
            </ViewNotice>
          }
        />
      )
    case 'sunburst':
      return (
        <SunburstChart
          points={data.points}
          series={names[0]}
          leaves={data.leaves}
          leafLabel="records"
          label={label}
          fallback={
            <ViewNotice>
              Nothing to share out yet — a sunburst needs positive values in “{names[0]}”.
            </ViewNotice>
          }
        />
      )
    case 'funnel':
      return <FunnelChart points={data.points} series={names[0]} label={label} fallback={empty} />
  }
}
