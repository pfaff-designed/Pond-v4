'use client'

import NumberFlow from '@number-flow/react'
import { useContext, useEffect, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import type { ModuleViewProps } from '../types'
import type { MetricBlock } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { deriveMetricValue, sourceNeedsCrossPage, type DerivedMetric } from './derive'
import { useCrossPageBlocks } from './use-cross-page-metric'

const TREND_GLYPH: Record<NonNullable<MetricBlock['trend']>, string> = {
  up: '↑',
  down: '↓',
  // Fix-6 (F15): '→' collided with the "go to source" link when both were
  // visible at once, making plain-metric rows show a double arrow. Use '—'
  // for flat so the source link's '→' is unambiguously a navigation control.
  flat: '—',
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
 * A bound metric derives its value live (ticket-23/38). Three binding shapes:
 *   - same-page  → from the SiblingBlocks context (no data fetch);
 *   - cross-page → from ANOTHER page's blocks, read through the cross-page seam;
 *   - aggregate  → summed across all child pages' blocks, via the same seam.
 *
 * The seam subscribes to react-query, which requires a QueryClientProvider. Rather than
 * force EVERY render surface (Storybook, the AI-terminal reference render, isolated
 * tests) to carry one for a display-only block, the cross-page hook is confined to a
 * child component (`CrossPageMetricRow`) that mounts ONLY when the source actually needs
 * a cross-page read AND a QueryClient is in context. Absent either, we degrade to the
 * pure same-page path — a cross-page source with no client renders a quiet `pending`
 * placeholder, exactly as t23 established: outside a page host, never crash, never a
 * wrong number.
 */
export function MetricView({ data }: ModuleViewProps<MetricBlock>) {
  const { blocks } = useSiblingBlocks()
  // A QueryClient is present in the real app (DocumentPanel/PageView live inside one).
  // `useContext` reads it without the throwing `useQuery`, so a client-less surface just
  // takes the pure path below.
  const hasQueryClient = useContext(QueryClientContext) !== undefined
  const needsCrossPage = sourceNeedsCrossPage(data.source)

  if (needsCrossPage && hasQueryClient) {
    return <CrossPageMetricRow data={data} />
  }

  // Pure path: same-page/unbound derive with no cross-page resolution. A cross-page or
  // aggregate source here (no client) resolves to `pending` — a placeholder, not a guess.
  const derived = deriveMetricValue(data, blocks)
  return <MetricRow data={data} derived={derived} />
}

/**
 * The connected variant: runs the cross-page seam (safe — only mounted when a
 * QueryClient exists and the source needs it). Feeds the SAME pure `deriveMetricValue`.
 */
function CrossPageMetricRow({ data }: { data: MetricBlock }) {
  const { blocks, pageId } = useSiblingBlocks()
  const cross = useCrossPageBlocks(data.source, pageId)
  const derived = deriveMetricValue(data, blocks, cross)
  return <MetricRow data={data} derived={derived} />
}

/** Presentational row — renders a resolved derivation. No data access; pure props. */
function MetricRow({ data, derived }: { data: MetricBlock; derived: DerivedMetric }) {
  const { scrollToBlock } = useSiblingBlocks()
  const numberFlowReady = useNumberFlowReady()
  // Only a live (bound) number animates as its source changes. `pending` has no number
  // yet, `unbound`/`stale` are static — nothing to count up to.
  const hasLiveValue = derived.state === 'derived' || derived.state === 'aggregate'
  const animate = hasLiveValue && numberFlowReady
  const unit = data.unit ? ` ${data.unit}` : ''
  // The displayed number: only a state that HAS a value shows one. `pending` shows a
  // placeholder instead (never the manual value dressed as live, never a wrong 0).
  const shownValue = derived.state === 'pending' ? null : derived.value

  return (
    <div className="flex items-baseline gap-2 text-sm text-mn-text">
      <span className="text-mn-text-secondary">{data.label}</span>
      {/* aria-label carries the plain value so assistive tech (and story tests) read
          one stable string even while NumberFlow visually animates split digits. */}
      <span
        className="font-medium tabular-nums"
        role="status"
        aria-label={
          shownValue === null ? `${data.label}: loading` : `${data.label}: ${shownValue}${unit}`
        }
      >
        {shownValue === null ? (
          // Quiet placeholder while cross-page data loads — an em-dash, not a number.
          <span className="text-mn-text-faint">—</span>
        ) : animate ? (
          <NumberFlow value={shownValue} suffix={unit} willChange isolate />
        ) : (
          `${shownValue}${unit}`
        )}
      </span>
      {data.trend && <span className="text-mn-text-faint">{TREND_GLYPH[data.trend]}</span>}

      {/* Aggregate rollups show their scope quietly in a caption (w2-design-brief:
          "across N milestone pages"); no `→` (there's no single source to jump to). */}
      {derived.state === 'aggregate' && (
        <span className="font-mono text-mn-11 lowercase tracking-wider text-mn-text-faint">
          across {derived.pageCount} {derived.pageCount === 1 ? 'page' : 'pages'}
        </span>
      )}

      {derived.state === 'derived' && (
        <button
          type="button"
          className="text-mn-text-faint hover:text-mn-text-meta"
          title="Go to source"
          aria-label="Go to source block"
          onClick={() => scrollToBlock?.(derived.sourceId)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 6h7M6.5 3l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {derived.state === 'stale' && (
        <span
          className="font-mono text-mn-11 lowercase tracking-wider text-mn-text-faint italic"
          // Covers stale shapes: the source block (or its whole page) was deleted, OR it
          // still exists but type-morphed into something the binding can't count.
          title="Source block or page missing or no longer countable"
        >
          source missing
        </span>
      )}
    </div>
  )
}
