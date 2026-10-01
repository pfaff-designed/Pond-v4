'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { PondChartSvg } from '../pond/pond-chart-svg'
import { plotBox, XLabels, YGrid } from '../pond/cartesian-axes'
import {
  DASH_SEGMENT,
  FILL_BAND,
  FONT_LABEL,
  FONT_LABEL_SMALL,
  GROUND,
  INK,
  LABEL,
  STROKE_LINE,
  Y_LABEL_DX,
  Y_LABEL_DY,
  ZERO_LINE,
  cartesianHeight,
} from '../pond/pond-chart-style'
import { formatTick } from '../pond/linear-scale'
import type { ReactNode } from 'react'
import { layoutNet } from './net-layout'

export interface NetChartProps {
  points: readonly FigurePoint[]
  series: readonly string[]
  label?: string
  fallback?: ReactNode
}

/** Signed ticks: "+500", "0", "-240" — the sign IS the reading. */
function signedTick(v: number): string {
  return v > 0 ? `+${formatTick(v)}` : formatTick(v)
}

/**
 * Net: a signed line over a zero line, the below-zero region banded in soft ink,
 * below-zero segments dashed and their markers hollow. No red: a loss is a
 * reading, not a removal (PROJECT_RULES).
 */
export function NetChart({ points, series, label = 'Net chart', fallback }: NetChartProps) {
  return (
    <PondChartSvg height={cartesianHeight} label={label} fallback={fallback}>
      {(width, height) => {
        const box = plotBox(width, height)
        const layout = layoutNet(points, series, box.w, box.h)
        if (!layout) return null
        const toY = (v: number) => box.y + layout.y(v)
        const zero = box.y + layout.zeroY
        return (
          <>
            {layout.band && <rect x={0} y={box.y + layout.band.y} width={box.w} height={layout.band.h} fill={FILL_BAND} />}
            <YGrid ticks={layout.ticks.filter((t) => t !== 0)} y={toY} plotW={box.w} format={signedTick} />
            <line x1={0} x2={box.w} y1={zero} y2={zero} stroke={ZERO_LINE} />
            <text x={box.w + Y_LABEL_DX} y={zero + Y_LABEL_DY} fontSize={FONT_LABEL} fill={LABEL} textAnchor="start">
              0
            </text>
            {layout.band && (
              <text x={4} y={box.y + box.h - 6} fontSize={FONT_LABEL_SMALL} fill={LABEL}>
                below zero — dashed
              </text>
            )}
            {layout.segments.map((s, i) => (
              <line
                key={i}
                x1={s.x1}
                y1={box.y + s.y1}
                x2={s.x2}
                y2={box.y + s.y2}
                stroke={INK}
                strokeWidth={STROKE_LINE}
                strokeDasharray={s.dashed ? DASH_SEGMENT : undefined}
                strokeLinecap="round"
              />
            ))}
            {layout.markers.map((m, i) => (
              <circle key={i} cx={m.x} cy={box.y + m.y} r={2.2} fill={m.below ? GROUND : INK} stroke={INK} strokeWidth={1.2}>
                <title>{`${m.label}: ${m.value}`}</title>
              </circle>
            ))}
            <XLabels items={layout.xLabels} plotW={box.w} height={height} />
          </>
        )
      }}
    </PondChartSvg>
  )
}
