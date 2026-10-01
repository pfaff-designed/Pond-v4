'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { PondChartSvg } from '../pond/pond-chart-svg'
import { plotBox, XLabels, YGrid } from '../pond/cartesian-axes'
import {
  DASH_SEGMENT,
  FONT_LABEL_SMALL,
  INK,
  INK_BAR,
  INK_REFERENCE,
  LABEL,
  STROKE_LINE,
  cartesianHeight,
} from '../pond/pond-chart-style'
import { seriesColor } from '../chart-ramp'
import { layoutComposed } from './composed-layout'

export interface ComposedChartProps {
  points: readonly FigurePoint[]
  series: readonly string[]
  /** A reference value drawn as the dashed "target" line (the mockup's budget). */
  target?: number
  label?: string
}

/**
 * Composed: translucent ink bars for the first series, a solid ink line for the
 * running total (or each further series), and a dashed reference for `target`.
 * Geometry in `composed-layout.ts`; colours are the chart tokens only.
 */
export function ComposedChart({ points, series, target, label = 'Composed chart' }: ComposedChartProps) {
  return (
    <PondChartSvg height={cartesianHeight} label={label}>
      {(width, height) => {
        const box = plotBox(width, height)
        const layout = layoutComposed(points, series, box.w, box.h, target)
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
            <XLabels items={layout.xLabels} plotW={box.w} height={height} />
          </>
        )
      }}
    </PondChartSvg>
  )
}
