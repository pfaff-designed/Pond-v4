'use client'

/**
 * The COMPACT inline presentation of the `chart` view mode (#259) — the React
 * half, beside the card's `collection-chart.tsx`; the rules are in `chart-compact.ts`. Measured off `PondTemplate.dc.html`'s
 * `renderVals()`:
 *
 *   bars    { display: 'flex', alignItems: 'flex-end', gap: 5, height: 72 }
 *   bar     { flex: 1, height: `${Math.round(h / mx * 100)}%`, borderRadius: 3,
 *             background: i === v.length - 1 ? fg : a(.28) }
 *   heat    { display: 'grid', gridTemplateColumns: 'repeat(12,minmax(0,1fr))',
 *             gridAutoFlow: 'column', gridTemplateRows: 'repeat(7,auto)', gap: 3 }
 *   cell    { width: '100%', aspectRatio: '1', borderRadius: 2,
 *             background: on ? (i > 71 ? fg : a(.45)) : a(.07) }
 *   voidBox (bars, empty) → `PondBlockEmpty box="void"`
 *
 * Drawn in CSS, not through Bklit — decided in #259: these are MARKS, with no
 * axes, legend, tooltip or interaction, and a 72px strip / an 84-cell 3px-gap grid
 * at `grid-auto-flow: column` lands exactly in CSS where bending Bklit's heatmap
 * would not. The chart CARD (`collection-chart.tsx`) stays Bklit's.
 *
 * Where the numbers come from does not change: `chartDataFromRows` over the
 * collection's (filter/sort-applied) rows, the same call the card makes. Nothing
 * here holds a copy — the strip reads `points`, the grid reads `heatmap.cells`.
 */

import { useMemo, type ComponentType } from 'react'
import type { PropertySchema } from '@/lib/properties/schema'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import { CHART_EMPTY_LINE, HEATMAP_DATE_NOTICE } from '../chart/card'
import type { ViewChartConfig } from './schema'
import type { CollectionRow } from './apply'
import { chartDataFromRows, type ChartData } from './chart-data'
import {
  barStrip,
  compactChartMark,
  heatGrid,
  type CompactChartMark,
  type HeatLevel,
} from './chart-compact'
import {} from './collection-chart'
import { ViewNotice } from './notice'

/** `bars`: flex · flex-end · gap 5 · height 72. */
const STRIP = 'flex h-[72px] items-end gap-[5px]'
/** `bar`: flex 1 · radius 3; the height is inline (a percent of the strip). */
const BAR = 'flex-1 rounded-[3px]'
/** The bar's ink: the LAST bar (the current period) full, the rest ink .28. */
const BAR_INK = { current: 'bg-mn-text', past: 'bg-mn-text/[0.28]' } as const

/** `heat`: grid · 12 columns · 7 rows · COLUMN flow (weeks across, days down) · gap 3. */
const GRID =
  'grid grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-[repeat(7,auto)] grid-flow-col gap-[3px]'
/** `cell`: width 100% · aspect 1 · radius 2. */
const CELL = 'w-full aspect-square rounded-[2px]'
/**
 * The three levels and only three — exhaustive over `HeatLevel`, so a fourth level
 * is a compile error, never an unstyled cell.
 */
const CELL_INK: Record<HeatLevel, string> = {
  off: 'bg-mn-text/[0.07]',
  on: 'bg-mn-text/[0.45]',
  recent: 'bg-mn-text',
}

/**
 * The bar strip. One bar per point in the view's own row order, heights normalised
 * to the max. A bucket whose series carries no figure keeps its slot at 0 so the
 * periods stay aligned. Empty — no points, or no point with a figure — is the
 * board's voidBox via the frame's `PondBlockEmpty`, with the chart's own line.
 */
function BarsMark({ data, name }: { data: ChartData; name: string }) {
  const figures = data.points.map((p) => p.values[name])
  if (figures.every((v) => v === undefined)) {
    return <PondBlockEmpty box="void" line={CHART_EMPTY_LINE} />
  }
  const bars = barStrip(figures.map((v) => v ?? 0))
  return (
    <div
      data-part="bars"
      role="img"
      aria-label={`${name} by ${data.xLabel}, ${bars.length} bars`}
      className={STRIP}
    >
      {bars.map((bar, i) => (
        <span
          key={data.points[i].x}
          data-part="bar"
          data-current={bar.current || undefined}
          className={`${BAR} ${bar.current ? BAR_INK.current : BAR_INK.past}`}
          style={{ height: `${bar.height}%` }}
        />
      ))}
    </div>
  )
}

/**
 * The heat grid: the twelve weeks to today, one cell a day. A calendar cannot be
 * read off a category label, so a non-date x property reads as the card's notice
 * (a configuration problem, not an empty state); a date x with no records is the
 * grid itself, all 84 cells at ink .07 — heat has no voidBox.
 */
function HeatMark({ data, name, today }: { data: ChartData; name: string; today?: Date }) {
  const cells = useMemo(() => heatGrid(data.heatmap?.cells ?? [], today), [data, today])
  if (data.xAxis !== 'date') {
    return <ViewNotice>{HEATMAP_DATE_NOTICE}</ViewNotice>
  }
  return (
    <div
      data-part="heat"
      role="img"
      aria-label={`${name} by ${data.xLabel}, the last twelve weeks`}
      className={GRID}
    >
      {cells.map((cell) => (
        <span
          key={cell.date}
          data-part="cell"
          data-level={cell.level}
          className={`${CELL} ${CELL_INK[cell.level]}`}
        />
      ))}
    </div>
  )
}

/** One renderer per mark — exhaustive, so a third mark is a compile error here. */
const MARK: Record<
  CompactChartMark,
  ComponentType<{ data: ChartData; name: string; today?: Date }>
> = {
  bars: BarsMark,
  heat: HeatMark,
}

export function CompactChart({
  schema,
  rows,
  chart,
  today,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  chart: ViewChartConfig
  /** The heat grid's anchor day — injectable so a story is deterministic. Defaults to now. */
  today?: Date
}) {
  const data = useMemo(() => chartDataFromRows(rows, schema, chart), [rows, schema, chart])
  const mark = compactChartMark({ id: '', type: 'view', mode: 'chart', chart })
  // Only reached for a kind with a mark (`CollectionView` branches on the same
  // read); a kind without one draws the card there, never a blank here.
  if (mark === null) return null
  const Mark = MARK[mark]
  return <Mark data={data} name={data.series[0].name} today={today} />
}
