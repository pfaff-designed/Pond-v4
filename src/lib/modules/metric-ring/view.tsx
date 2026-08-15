'use client'

import type { ModuleViewProps } from '../types'
import type { MetricRingBlock } from './schema'

const SIZE = 96
const STROKE = 7

/**
 * Progress-ring view — SVG geometry harvested from the v85 proto `Ring`. Styling is
 * deliberately neutral (zinc track + `currentColor` arc): brand tokens/accent land
 * with the token↔contract reconciliation (t15/t17), not here. Read-only.
 */
export function MetricRingView({ data }: ModuleViewProps<MetricRingBlock>) {
  const r = (SIZE - STROKE) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, data.pct))

  return (
    <div className="relative text-zinc-800" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center leading-none">
        <span className="text-2xl tabular-nums tracking-tight">{data.label}</span>
        {data.sub && (
          <span className="text-[10px] uppercase tracking-widest text-zinc-400">{data.sub}</span>
        )}
      </div>
    </div>
  )
}
