'use client'

import type { ModuleViewProps } from '../types'
import type { MetricBlock } from './schema'

const TREND_GLYPH: Record<NonNullable<MetricBlock['trend']>, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
}

/**
 * Metric view — read-only by design (per ticket-09, a metric is AI-maintained, not
 * hand-edited). Ignores `editable`: a labelled figure with optional unit + trend.
 */
export function MetricView({ data }: ModuleViewProps<MetricBlock>) {
  return (
    <div className="flex items-baseline gap-2 text-sm text-zinc-800">
      <span className="text-zinc-500">{data.label}</span>
      <span className="font-medium">
        {data.value}
        {data.unit ? ` ${data.unit}` : ''}
      </span>
      {data.trend && <span className="text-zinc-400">{TREND_GLYPH[data.trend]}</span>}
    </div>
  )
}
