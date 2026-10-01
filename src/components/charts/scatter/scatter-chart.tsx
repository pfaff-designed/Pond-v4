'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { PondChartSvg } from '../pond/pond-chart-svg'
import { plotBox, XLabels, YGrid } from '../pond/cartesian-axes'
import {
  DASH_PROJECTION,
  FONT_LABEL_SMALL,
  INK,
  INK_DOT,
  LABEL,
  STROKE_TREND,
  cartesianHeight,
} from '../pond/pond-chart-style'
import { seriesColor } from '../chart-ramp'
import type { ReactNode } from 'react'
import { layoutScatter } from './scatter-layout'

export interface ScatterChartProps {
  points: readonly FigurePoint[]
  series: readonly string[]
  label?: string
  fallback?: ReactNode
}

/**
 * Scatter: 3.2px ink dots (the .72 step), a dashed least-squares trend for the
 * first series, the y series named small at the top-left as the mockup does.
 */
export function ScatterChart({ points, series, label = 'Scatter chart', fallback }: ScatterChartProps) {
  return (
    <PondChartSvg height={cartesianHeight} label={label} fallback={fallback}>
      {(width, height) => {
        const box = plotBox(width, height)
        const layout = layoutScatter(points, series, box.w, box.h)
        if (!layout) return null
        const toY = (v: number) => box.y + layout.y(v)
        return (
          <>
            <YGrid ticks={layout.yTicks} y={toY} plotW={box.w} />
            {layout.dots.map((dots, s) => (
              <g key={series[s]}>
                {dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={box.y + d.y} r={3.2} fill={s === 0 ? INK_DOT : seriesColor(s)}>
                    <title>{`${d.label}: ${d.value}`}</title>
                  </circle>
                ))}
              </g>
            ))}
            {layout.trend && (
              <line
                x1={layout.trend.x1}
                y1={box.y + layout.trend.y1}
                x2={layout.trend.x2}
                y2={box.y + layout.trend.y2}
                stroke={INK}
                strokeWidth={STROKE_TREND}
                strokeDasharray={DASH_PROJECTION}
                strokeLinecap="round"
              />
            )}
            <text x={0} y={6} fontSize={FONT_LABEL_SMALL} fill={LABEL} textAnchor="start">
              {series[0]}
            </text>
            <XLabels items={layout.xLabels} plotW={box.w} height={height} />
          </>
        )
      }}
    </PondChartSvg>
  )
}
