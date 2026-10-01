'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { rankColor } from '../chart-ramp'
import { formatValue } from '../pond/linear-scale'
import { FUNNEL_GAP, FUNNEL_ROW_H, layoutFunnel } from './funnel-layout'

export interface FunnelChartProps {
  points: readonly FigurePoint[]
  series: string
  label?: string
}

/**
 * Funnel: the mockup's row layout — an 86px label, a centred 24px bar whose
 * width is the step's share of the mouth, the count right-aligned at weight 500.
 * Ranked ink fills fade down the steps. Plain flex, as the mockup draws it.
 */
export function FunnelChart({ points, series, label = 'Funnel chart' }: FunnelChartProps) {
  const steps = layoutFunnel(points, series)
  if (steps.length === 0) return null
  return (
    <ol
      role="img"
      aria-label={label}
      className="mn-arrive m-0 flex list-none flex-col justify-center p-0"
      style={{ gap: FUNNEL_GAP, minHeight: 150 }}
    >
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-3 text-[12.5px] text-mn-text">
          <span className="w-[86px] truncate text-mn-text-meta" title={s.label}>
            {s.label}
          </span>
          <span className="flex flex-1 justify-center">
            <span
              aria-hidden
              className="block rounded-[3px]"
              style={{ height: FUNNEL_ROW_H, width: `${s.share * 100}%`, background: rankColor(s.rank) }}
            />
          </span>
          <span className="w-[26px] text-right font-medium tabular-nums">{formatValue(s.value)}</span>
        </li>
      ))}
    </ol>
  )
}
