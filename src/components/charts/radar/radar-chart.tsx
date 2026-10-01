'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { PondChartSvg } from '../pond/pond-chart-svg'
import { FILL_AREA, FONT_LABEL, GRID, INK, LABEL_STRONG, STROKE_RADAR } from '../pond/pond-chart-style'
import { seriesColor } from '../chart-ramp'
import type { ReactNode } from 'react'
import { layoutRadar, radialHeight } from './radar-layout'

export interface RadarChartProps {
  points: readonly FigurePoint[]
  series: readonly string[]
  label?: string
  fallback?: ReactNode
}

/**
 * Radar: hairline rings and spokes, axis names in the strong label tier, and an
 * ink-stroked polygon with a .12 area fill per series.
 */
export function RadarChart({ points, series, label = 'Radar chart', fallback }: RadarChartProps) {
  return (
    <PondChartSvg height={radialHeight} label={label} fallback={fallback}>
      {(width, height) => {
        const r = layoutRadar(points, series, width, height)
        if (!r) return null
        return (
          <>
            {r.rings.map((pts, i) => (
              <polygon key={i} points={pts} fill="none" stroke={GRID} />
            ))}
            {r.axes.map((a) => (
              <g key={a.label}>
                <line x1={r.cx} y1={r.cy} x2={a.x} y2={a.y} stroke={GRID} />
                <text x={a.lx} y={a.ly} fontSize={FONT_LABEL} fill={LABEL_STRONG} textAnchor="middle">
                  {a.label}
                </text>
              </g>
            ))}
            {r.polygons.map((poly, i) => (
              <polygon
                key={poly.name}
                points={poly.points}
                fill={i === 0 ? FILL_AREA : 'none'}
                stroke={i === 0 ? INK : seriesColor(i)}
                strokeWidth={STROKE_RADAR}
                strokeLinejoin="round"
              >
                <title>{poly.name}</title>
              </polygon>
            ))}
          </>
        )
      }}
    </PondChartSvg>
  )
}
