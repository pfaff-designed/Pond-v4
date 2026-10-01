/**
 * The shared cartesian furniture of the PondChart kinds (composed / net / scatter):
 * horizontal grid lines with their value labels in the RIGHT gutter, and category
 * labels along the bottom — placed exactly as `pond-charts.js` places them
 * (labels at plot-right + 6, baseline +3.5; bottom labels 2px above the frame).
 */
import {
  BOTTOM_PAD,
  FONT_LABEL,
  GRID,
  LABEL,
  RIGHT_GUTTER,
  TOP_PAD,
  Y_LABEL_DX,
  Y_LABEL_DY,
} from './pond-chart-style'
import { formatTick } from './linear-scale'

/** The plot rectangle inside a frame of `width` × `height`. */
export function plotBox(width: number, height: number) {
  return { x: 0, y: TOP_PAD, w: Math.max(0, width - RIGHT_GUTTER), h: Math.max(0, height - TOP_PAD - BOTTOM_PAD) }
}

export function YGrid({
  ticks,
  y,
  plotW,
  stroke = GRID,
  format = formatTick,
}: {
  ticks: readonly number[]
  y: (v: number) => number
  plotW: number
  stroke?: string
  format?: (v: number) => string
}) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={stroke} />
          <text x={plotW + Y_LABEL_DX} y={y(t) + Y_LABEL_DY} fontSize={FONT_LABEL} fill={LABEL} textAnchor="start">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

export interface XLabel {
  label: string
  x: number
}

/** Approximate pixel budget per bottom label before the axis thins to first / middle / last. */
const LABEL_BUDGET_PX = 44

/**
 * Which bottom labels to show: all when they fit, else the first, middle and
 * last — the way the weight line in the mockup reads "jul · aug · sep" over
 * twelve points.
 */
export function thinXLabels(items: readonly XLabel[], plotW: number): XLabel[] {
  if (items.length <= 1 || items.length * LABEL_BUDGET_PX <= plotW) return [...items]
  const mid = Math.floor((items.length - 1) / 2)
  const picks = [0, mid, items.length - 1].filter((i, k, arr) => arr.indexOf(i) === k)
  return picks.map((i) => items[i])
}

export function XLabels({ items, plotW, height }: { items: readonly XLabel[]; plotW: number; height: number }) {
  const edge = 12
  return (
    <g aria-hidden>
      {thinXLabels(items, plotW).map((it, i) => (
        <text
          key={`${it.label}-${i}`}
          x={it.x}
          y={height - 2}
          fontSize={FONT_LABEL}
          fill={LABEL}
          textAnchor={it.x < edge ? 'start' : it.x > plotW - edge ? 'end' : 'middle'}
        >
          {it.label}
        </text>
      ))}
    </g>
  )
}
