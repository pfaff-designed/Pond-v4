'use client'

import type { ModuleViewProps } from '../types'
import type { MetricRingBlock } from './schema'

const SIZE = 96
const STROKE = 7

/**
 * The bare ring SVG — used as the composed centre of MetricRingView's card.
 * Kept separate so it can be reused or tested independently.
 */
function ProgressRing({ label, sub, pct }: { label: string; sub?: string; pct: number }) {
  const r = (SIZE - STROKE) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, pct))

  return (
    <div className="relative flex-shrink-0 text-mn-text" style={{ width: SIZE, height: SIZE }}>
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
          strokeDashoffset={c * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center leading-none">
        <span className="text-2xl tabular-nums tracking-tight">{label}</span>
        {sub && (
          <span className="font-mono text-[10px] lowercase tracking-wider text-mn-text-secondary">
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Progress-ring view — Fix-6 (F15): composed card layout at column width.
 * The old raw 96×96 block collapsed to nothing inside the editor column. Now
 * the block renders as a centred card: title above the ring (wraps gracefully
 * for long titles), ring centred, percentage caption below. Styling is
 * deliberately neutral (zinc track + `currentColor` arc): brand tokens/accent
 * land with the token↔contract reconciliation (t15/t17), not here. Read-only.
 */
export function MetricRingView({ data }: ModuleViewProps<MetricRingBlock>) {
  const pct = Math.max(0, Math.min(1, data.pct))
  const pctLabel = `${Math.round(pct * 100)}%`

  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center">
      {/* Title — wraps on long text instead of collapsing the ring */}
      <span className="max-w-xs text-sm font-medium leading-snug text-mn-text-meta">
        {data.label}
      </span>
      <ProgressRing label={pctLabel} sub={data.sub} pct={pct} />
      {/* Percentage caption below the ring for at-a-glance reading */}
      <span className="text-xs text-mn-text-secondary">{pctLabel} complete</span>
    </div>
  )
}
