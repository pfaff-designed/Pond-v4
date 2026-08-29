'use client'

import type { ModuleViewProps } from '../types'
import type { ChartBarBlock } from './schema'
import { seriesNames, toChartRows } from '../chart/data'
import { ChartCard, CHART_SERIES_COLORS } from '../chart/card'
import { BarChart } from '@/components/charts/bar-chart'
import { Bar } from '@/components/charts/bar'
import { Grid } from '@/components/charts/grid'

/**
 * `chart-bar` view (ticket-36). Read-only. Maps the shared point-major data into the
 * Bklit `BarChart` row shape (categorical x) and renders a `<Bar>` per series —
 * grouped bars when there is more than one — inside the shared module-card chrome.
 * Animation is off for determinism/calm, same as `chart-line`.
 */
export function ChartBarView({ data }: ModuleViewProps<ChartBarBlock>) {
  const points = data.points ?? []
  const names = seriesNames(points)
  const rows = toChartRows(points)

  return (
    <ChartCard
      title={data.title}
      caption={data.caption}
      xLabel={data.xLabel}
      yLabel={data.yLabel}
      points={points}
      seriesColors={CHART_SERIES_COLORS}
    >
      <BarChart
        data={rows}
        xDataKey="x"
        aspectRatio="5 / 2"
        margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
      >
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
    </ChartCard>
  )
}
