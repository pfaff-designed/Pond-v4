'use client'

import NumberFlow from '@number-flow/react'
import { useEffect, useState } from 'react'
import type { ModuleViewProps } from '../types'
import type { MetricBlock } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { deriveMetricValue } from './derive'

const TREND_GLYPH: Record<NonNullable<MetricBlock['trend']>, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
}

/**
 * NumberFlow is a custom element; before its module registers, rendering it emits a
 * bare empty element (no digits) — so we render a plain number until it's defined,
 * then swap in the animating one. Mirrors chart-stat-flow's guard. Once ready, a
 * change to a bound metric's derived value counts up smoothly (ticket-31).
 */
function useNumberFlowReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof customElements !== 'undefined' && Boolean(customElements.get('number-flow-react'))
  )
  useEffect(() => {
    if (ready || typeof customElements === 'undefined') return
    let cancelled = false
    customElements.whenDefined('number-flow-react').then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])
  return ready
}

/**
 * Metric view — read-only by design (per ticket-09, a metric is AI-maintained, not
 * hand-edited). Ignores `editable`: a labelled figure with optional unit + trend.
 *
 * When the metric declares a `source` binding (ticket-23) its value is DERIVED live
 * from a sibling block read through the SiblingBlocks context — checking a checklist
 * item updates it immediately. A bound metric shows a `→` link that scrolls to its
 * source; an unbound metric shows no such control (no dead affordance). If the bound
 * source is gone (deleted), the metric falls back to its manual value with a subtle
 * "source missing" note and never crashes.
 */
export function MetricView({ data }: ModuleViewProps<MetricBlock>) {
  const { blocks, scrollToBlock } = useSiblingBlocks()
  const derived = deriveMetricValue(data, blocks)
  const numberFlowReady = useNumberFlowReady()
  // Only a live (bound + derived) metric animates: its number changes as siblings
  // change. An unbound/stale metric shows a static figure — nothing to count up to.
  const animate = derived.state === 'derived' && numberFlowReady
  const unit = data.unit ? ` ${data.unit}` : ''

  return (
    <div className="flex items-baseline gap-2 text-sm text-zinc-800">
      <span className="text-zinc-500">{data.label}</span>
      {/* aria-label carries the plain value so assistive tech (and story tests) read
          one stable string even while NumberFlow visually animates split digits. */}
      <span
        className="font-medium tabular-nums"
        role="status"
        aria-label={`${data.label}: ${derived.value}${unit}`}
      >
        {animate ? (
          <NumberFlow value={derived.value} suffix={unit} willChange isolate />
        ) : (
          `${derived.value}${unit}`
        )}
      </span>
      {data.trend && <span className="text-zinc-400">{TREND_GLYPH[data.trend]}</span>}

      {derived.state === 'derived' && (
        <button
          type="button"
          className="text-zinc-400 hover:text-zinc-700"
          title="Go to source"
          aria-label="Go to source block"
          onClick={() => scrollToBlock?.(derived.sourceId)}
        >
          →
        </button>
      )}

      {derived.state === 'stale' && (
        <span
          className="text-[11px] text-zinc-400 italic"
          // Covers both stale shapes: the source block was deleted, OR it still
          // exists but type-morphed into something the binding can't count.
          title="Source block missing or no longer countable"
        >
          source missing
        </span>
      )}
    </div>
  )
}
