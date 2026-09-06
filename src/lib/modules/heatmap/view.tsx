'use client'

import { useMemo } from 'react'
import type { ModuleViewProps } from '../types'
import type { HeatmapBlock } from './schema'
import { toHeatmapGrid } from './data'
import { KICKER } from '../chart/card'
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
} from '@/components/charts/heatmap'

/**
 * `heatmap` view (#12). Read-only, like the promoted charts: composed by the AI,
 * not hand-dragged. Bins the flat persisted cells into the Bklit
 * `HeatmapColumn[]` grid (`toHeatmapGrid`) and renders the GitHub-contributions
 * layout — fluid square cells, month labels on top, weekday initials on the
 * left. Animation is off so the grid is deterministic in story tests and calm on
 * a dense page (mirrors chart-line's reasoning). Chrome mirrors ChartCard
 * (kicker title, muted caption, calm empty state) — ChartCard itself is
 * point-shaped, so the classes are shared rather than the component.
 */
export function HeatmapView({ data }: ModuleViewProps<HeatmapBlock>) {
  const grid = useMemo(() => toHeatmapGrid(data.cells ?? []), [data.cells])

  return (
    <div className="text-sm text-zinc-800">
      {data.title && <div className={KICKER}>{data.title}</div>}
      {data.caption && <div className="mt-0.5 text-xs text-zinc-500">{data.caption}</div>}

      {grid === null ? (
        <div className="mt-2 rounded-sm border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400">
          No data yet
        </div>
      ) : (
        <div className="mt-2">
          <HeatmapChart
            data={grid.columns}
            xDomain={grid.xDomain}
            sizingColumnCount={grid.columns.length}
            animate={false}
            margin={{ top: 24, right: 8, bottom: 0, left: 32 }}
          >
            <HeatmapCells />
            <HeatmapXAxis />
            <HeatmapYAxis labelFormat="initial" />
          </HeatmapChart>
        </div>
      )}
    </div>
  )
}
