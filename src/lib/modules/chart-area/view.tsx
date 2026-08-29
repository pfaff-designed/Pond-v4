'use client'

import type { ModuleViewProps } from '../types'
import type { ChartAreaBlock } from './schema'
import { seriesNames, toChartRows } from '../chart/data'
import { ChartCard, CHART_SERIES_COLORS } from '../chart/card'
import { AreaChart } from '@/components/charts/area-chart'
import { Area } from '@/components/charts/area'
import { Grid } from '@/components/charts/grid'

/**
 * `chart-area` view (ticket-36). Read-only. Maps the shared point-major data into the
 * Bklit `AreaChart` row shape and renders an `<Area>` per series inside the shared
 * module-card chrome. Animation is off for determinism/calm, same as `chart-line`.
 */
export function ChartAreaView({ data }: ModuleViewProps<ChartAreaBlock>) {
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
      <AreaChart
        data={rows}
        xDataKey="x"
        aspectRatio="5 / 2"
        margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
      >
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
    </ChartCard>
  )
}
