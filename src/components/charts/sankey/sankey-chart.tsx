'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { PondChartSvg } from '../pond/pond-chart-svg'
import { FILL_SOFT, FILL_STRONG, FONT_LABEL, GROUND, INK, LABEL_STRONG } from '../pond/pond-chart-style'
import { formatValue } from '../pond/linear-scale'
import { layoutSankey, sankeyHeight } from './sankey-layout'

export interface SankeyChartProps {
  points: readonly FigurePoint[]
  /** The series whose values flow. */
  series: string
  label?: string
}

/**
 * Sankey: a solid ink source node, soft-ink ribbons separated by a hairline of
 * the chart's own ground, strong-ink target nodes labelled "{category} {value}",
 * and the total named under the source.
 */
export function SankeyChart({ points, series, label = 'Sankey chart' }: SankeyChartProps) {
  const flowCount = points.filter((p) => (p.values[series] ?? 0) > 0).length
  return (
    <PondChartSvg height={sankeyHeight(flowCount)} label={label}>
      {(width, height) => {
        const s = layoutSankey(points, series, width, height)
        if (!s) return null
        return (
          <>
            <rect x={s.source.x} y={s.source.y} width={s.source.w} height={s.source.h} fill={INK} />
            {s.flows.map((f) => (
              <g key={f.label}>
                <path d={f.path} fill={FILL_SOFT} stroke={GROUND} strokeWidth={1}>
                  <title>{`${f.label}: ${formatValue(f.value)}`}</title>
                </path>
                <rect x={f.node.x} y={f.node.y} width={f.node.w} height={f.node.h} fill={FILL_STRONG} />
                <text x={f.lx} y={f.ly} fontSize={FONT_LABEL} fill={LABEL_STRONG} textAnchor="start">
                  {`${f.label} ${formatValue(f.value)}`}
                </text>
              </g>
            ))}
            <text x={4} y={height + 2} fontSize={FONT_LABEL} fill={LABEL_STRONG} textAnchor="start">
              {`${series} ${formatValue(s.total)}`}
            </text>
          </>
        )
      }}
    </PondChartSvg>
  )
}
