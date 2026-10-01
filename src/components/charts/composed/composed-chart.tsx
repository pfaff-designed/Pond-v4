'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { PondChartSvg } from '../pond/pond-chart-svg'
import { plotBox, XLabels, YGrid } from '../pond/cartesian-axes'
import {
  DASH_PROJECTION,
  DASH_SEGMENT,
  FONT_LABEL_SMALL,
  INK,
  INK_BAR,
  INK_REFERENCE,
  LABEL,
  LABEL_STRONG,
  STROKE_LINE,
  STROKE_PROJECTION,
  cartesianHeight,
} from '../pond/pond-chart-style'
import type { ReactNode } from 'react'
import { seriesColor } from '../chart-ramp'
import { layoutComposed } from './composed-layout'

export interface ComposedChartProps {
  points: readonly FigurePoint[]
  series: readonly string[]
  /** A reference value drawn as the dashed line the mockup labels "budget". */
  target?: number
  /** The reference line's word — "budget" (mockup) unless the caller has a better noun. */
  targetLabel?: string
  label?: string
  /** Shown instead of the drawing when there is nothing to draw. */
  fallback?: ReactNode
}

/**
 * Composed: translucent ink bars for the first series, a solid ink line for the
 * running total (or each further series), a dashed 1.4px projection arm into the
 * empty slot after the last datum, and a dashed reference for `target`.
 * Geometry in `composed-layout.ts`; colours are the chart tokens only.
 */
export function ComposedChart({ points, series, target, targetLabel, label = 'Composed chart', fallback }: ComposedChartProps) {
  return (
    <PondChartSvg height={cartesianHeight} label={label} fallback={fallback}>
      {(width, height) => {
        const box = plotBox(width, height)
        const layout = layoutComposed(points, series, box.w, box.h, target, targetLabel)
        if (!layout) return null
        const toY = (v: number) => box.y + layout.y(v)
        return (
          <>
            <YGrid ticks={layout.ticks} y={toY} plotW={box.w} />
            {layout.target && (
              <g aria-hidden>
                <line
                  x1={0}
                  x2={box.w}
                  y1={box.y + layout.target.y}
                  y2={box.y + layout.target.y}
                  stroke={INK_REFERENCE}
                  strokeDasharray={DASH_SEGMENT}
                />
                <text x={4} y={box.y + layout.target.y - 5} fontSize={FONT_LABEL_SMALL} fill={LABEL}>
                  {layout.target.label}
                </text>
              </g>
            )}
            {layout.bars.map((b) => (
              <rect key={b.label} x={b.x} y={box.y + b.y} width={b.w} height={b.h} rx={2} fill={INK_BAR}>
                <title>{`${b.label}: ${b.value}`}</title>
              </rect>
            ))}
            {layout.lines.map((l, i) => (
              <g key={l.name}>
                <polyline
                  points={l.points.map((p) => `${p.x},${box.y + p.y}`).join(' ')}
                  fill="none"
                  stroke={i === 0 ? INK : seriesColor(i)}
                  strokeWidth={STROKE_LINE}
                  strokeLinejoin="round"
                />
                {l.points.length > 0 && (
                  <circle
                    cx={l.points[l.points.length - 1].x}
                    cy={box.y + l.points[l.points.length - 1].y}
                    r={3}
                    fill={i === 0 ? INK : seriesColor(i)}
                  />
                )}
              </g>
            ))}
            {layout.projection && (
              <g>
                <polyline
                  points={`${layout.projection.x1},${box.y + layout.projection.y1} ${layout.projection.x2},${box.y + layout.projection.y2}`}
                  fill="none"
                  stroke={INK}
                  strokeWidth={STROKE_PROJECTION}
                  strokeDasharray={DASH_PROJECTION}
                  strokeLinecap="round"
                />
                <text
                  x={layout.projection.x2 - 2}
                  y={box.y + layout.projection.y2 - 7}
                  fontSize={FONT_LABEL_SMALL}
                  fill={LABEL_STRONG}
                  textAnchor="end"
                >
                  {layout.projection.label}
                </text>
              </g>
            )}
            <XLabels items={layout.xLabels} plotW={box.w} height={height} />
          </>
        )
      }}
    </PondChartSvg>
  )
}
