'use client'

/**
 * Chart mode — the collection's rows AGGREGATED into a chart at read time (#111),
 * drawn by whichever of the eleven kinds the view names (#94).
 *
 * Nothing is stored: `chartDataFromRows` buckets the (already filtered + sorted) rows
 * by the x property and aggregates each series within a bucket, so editing a record in
 * the table view moves this chart on the next read. That is the #111 law — "the record
 * is the source of truth… nothing holds a copy". The kind is a VALUE of the view's
 * config, never a block type; switching kinds touches only `chart.kind`.
 */

import { useMemo } from 'react'
import type { ViewBlock } from './schema'
import type { CollectionRow } from './apply'
import { chartDataFromRows, type ChartData } from './chart-data'
import { ViewNotice } from './notice'
import { toChartRows } from '../chart/data'
import { ChartCard, CHART_SERIES_COLORS } from '../chart/card'
import type { PropertySchema } from '@/lib/properties/schema'
import { LineChart, Line } from '@/components/charts/line-chart'
import { AreaChart } from '@/components/charts/area-chart'
import { Area } from '@/components/charts/area'
import { BarChart } from '@/components/charts/bar-chart'
import { Bar } from '@/components/charts/bar'
import { Grid } from '@/components/charts/grid'
import { ComposedChart } from '@/components/charts/composed'
import { NetChart } from '@/components/charts/net'
import { GaugeChart } from '@/components/charts/gauge'
import { RadarChart, RADAR_MIN_AXES } from '@/components/charts/radar'
import { ScatterChart } from '@/components/charts/scatter'
import { SankeyChart } from '@/components/charts/sankey'
import { SunburstChart } from '@/components/charts/sunburst'
import { FunnelChart } from '@/components/charts/funnel'

const color = (i: number) => CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]

/** The three promoted Bklit visuals, fed the flat row shape they expect. */
function BklitKind({ data, names }: { data: ChartData; names: string[] }) {
  const common = {
    data: toChartRows(data.points),
    xDataKey: 'x',
    aspectRatio: '5 / 2',
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
  } as const
  if (data.kind === 'line') {
    return (
      <LineChart {...common}>
        <Grid />
        {names.map((name, i) => (
          <Line key={name} dataKey={name} stroke={color(i)} animate={false} loading={false} />
        ))}
      </LineChart>
    )
  }
  if (data.kind === 'area') {
    return (
      <AreaChart {...common}>
        <Grid />
        {names.map((name, i) => (
          <Area key={name} dataKey={name} fill={color(i)} stroke={color(i)} animate={false} loading={false} />
        ))}
      </AreaChart>
    )
  }
  // `stacked` reaches the bar renderer: it is the one Bklit visual that stacks.
  return (
    <BarChart {...common} stacked={data.stacked}>
      <Grid />
      {names.map((name, i) => (
        <Bar key={name} dataKey={name} fill={color(i)} animate={false} />
      ))}
    </BarChart>
  )
}

/**
 * One renderer per kind. Each PondChart kind reads the same point-major data; the
 * three that need an extra reading (scatter per record, sunburst leaves, gauge
 * figure) get it from `ChartData`, derived in `chart-data.ts`. A kind whose data
 * prerequisite is missing reads as a calm notice that says what to change.
 */
export function ChartKind({ data, names }: { data: ChartData; names: string[] }) {
  const label = `${data.kind} chart of ${names.join(', ')} by ${data.xLabel}`
  switch (data.kind) {
    case 'line':
    case 'area':
    case 'bar':
      return <BklitKind data={data} names={names} />
    case 'composed':
      return <ComposedChart points={data.points} series={names} target={data.target} label={label} />
    case 'net':
      return <NetChart points={data.points} series={names} label={label} />
    case 'gauge': {
      if (!data.gauge || data.gauge.value === null) {
        return <ViewNotice>Nothing to read for this gauge — plot a number field.</ViewNotice>
      }
      // "14 of 24 records" when the target is the record count; "23 of 30 pages read"
      // when the person set a goal — the unit is then what the series counts.
      const unit = data.target === undefined ? 'records' : names[0].toLowerCase()
      return <GaugeChart value={data.gauge.value} target={data.gauge.target} unit={unit} label={label} />
    }
    case 'radar':
      if (data.points.length < RADAR_MIN_AXES) {
        return <ViewNotice>A radar needs at least three categories — pick a “By” field with more values.</ViewNotice>
      }
      return <RadarChart points={data.points} series={names} label={label} />
    case 'scatter':
      return <ScatterChart points={data.points} series={names} label={label} />
    case 'sankey':
      return <SankeyChart points={data.points} series={names[0]} label={label} />
    case 'sunburst':
      return <SunburstChart points={data.points} series={names[0]} leaves={data.leaves} leafLabel="records" label={label} />
    case 'funnel':
      return <FunnelChart points={data.points} series={names[0]} label={label} />
  }
}

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
  return (
    <ChartCard xLabel={data.xLabel} yLabel={names.join(' · ')} points={data.points} seriesColors={CHART_SERIES_COLORS}>
      <ChartKind data={data} names={names} />
    </ChartCard>
  )
}
