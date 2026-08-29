'use client'

import type { ModuleViewProps } from '../types'
import type { ChartLineBlock } from './schema'
import { seriesNames, toChartRows } from '../chart/data'
import { ChartCard, CHART_SERIES_COLORS } from '../chart/card'
import { LineChart, Line } from '@/components/charts/line-chart'
import { Grid } from '@/components/charts/grid'

/**
 * `chart-line` view (ticket-36). Read-only, like the other AI-maintained data
 * modules (metric, metric-ring): a chart is composed by the AI, not hand-dragged.
 * Maps the shared point-major data into the Bklit `LineChart` row shape and renders a
 * `<Line>` per series inside the shared module-card chrome. Animation is off so the
 * chart is deterministic in story tests and calm on a dense page (the design brief's
 * "one authored moment" belongs to page arrival, not every embedded chart).
 */
export function ChartLineView({ data }: ModuleViewProps<ChartLineBlock>) {
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
      <LineChart
        data={rows}
        xDataKey="x"
        aspectRatio="5 / 2"
        margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
      >
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
    </ChartCard>
  )
}
