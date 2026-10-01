'use client'

import type { FigurePoint } from '../pond/pond-chart-data'
import { rankColor } from '../chart-ramp'
import { layoutSunburst, SUNBURST_OUTER_OPACITY, SUNBURST_SIZE } from './sunburst-layout'

export interface SunburstChartProps {
  points: readonly FigurePoint[]
  series: string
  /** Each inner category's records, keyed by the category label — the outer ring. */
  leaves?: Readonly<Record<string, readonly FigurePoint[]>>
  /** What the outer ring is made of, for the footnote ("records", "nested pages"). */
  leafLabel?: string
  label?: string
}

/**
 * Sunburst: the mockup's two rings at 140 × 150 beside a legend of the inner
 * categories (swatch, name, share), footnoted "outer ring: {leaves}". Ranked
 * ink fills; the outer ring sits at .52 of its parent — exactly the mockup's
 * opacity math.
 */
export function SunburstChart({ points, series, leaves, leafLabel = 'records', label = 'Sunburst chart' }: SunburstChartProps) {
  const s = layoutSunburst(points, series, leaves)
  if (!s) return null
  return (
    <div className="mn-arrive flex items-center gap-[18px]" style={{ height: SUNBURST_SIZE }}>
      <svg width={SUNBURST_SIZE - 10} height={SUNBURST_SIZE} viewBox={`0 0 ${SUNBURST_SIZE - 10} ${SUNBURST_SIZE}`} role="img" aria-label={label} style={{ display: 'block', overflow: 'visible', flex: 'none' }}>
        {s.inner.map((slice) => (
          <path key={slice.label} d={slice.path} fill={rankColor(slice.rank)}>
            <title>{`${slice.label}: ${Math.round(slice.share * 100)}%`}</title>
          </path>
        ))}
        {s.outer.map((slice, i) => (
          <path key={`${slice.label}-${i}`} d={slice.path} fill={rankColor(slice.parentRank)} opacity={SUNBURST_OUTER_OPACITY}>
            <title>{`${slice.label}: ${Math.round(slice.share * 100)}%`}</title>
          </path>
        ))}
      </svg>
      <ul className="m-0 flex flex-1 list-none flex-col gap-[7px] p-0">
        {s.inner.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-[12.5px] text-mn-text">
            <span aria-hidden className="inline-block h-2 w-2 rounded-[2px]" style={{ background: rankColor(slice.rank) }} />
            <span className="flex-1 text-mn-text-meta">{slice.label}</span>
            <span className="font-medium tabular-nums">{`${Math.round(slice.share * 100)}%`}</span>
          </li>
        ))}
        {s.outer.length > 0 && (
          <li className="pt-0.5 text-mn-11 text-mn-text-secondary">{`outer ring: ${leafLabel}`}</li>
        )}
      </ul>
    </div>
  )
}
