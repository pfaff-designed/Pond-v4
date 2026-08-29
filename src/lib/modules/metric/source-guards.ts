/**
 * Narrowers over the persisted metric-source union (ticket-38) — the one place the
 * three source shapes are told apart.
 *
 * A separate file, deliberately: schema.ts imports `deriveMetricValue` (a VALUE) from
 * derive.ts for its serialize facet, so derive.ts must never import a value back from
 * schema.ts — that would be a genuine runtime import cycle with an init-order hazard.
 * These guards are needed by BOTH sides (schema's serialize and derive's dispatch), so
 * they live here with ZERO runtime imports (the schema import below is type-only,
 * erased at compile), keeping the graph acyclic: schema → {derive, source-guards},
 * derive → source-guards.
 */
import type {
  MetricSource,
  MetricSourceAggregate,
  MetricSourceCrossPage,
  MetricSourceSamePage,
} from './schema'

/** Cross-page: binds to a block on ANOTHER page (`pageId` is the discriminating key). */
export function isCrossPageSource(source: MetricSource): source is MetricSourceCrossPage {
  return 'pageId' in source
}

/** Aggregate: sums a kind across all direct child pages (`pages` literal). */
export function isAggregateSource(source: MetricSource): source is MetricSourceAggregate {
  return 'pages' in source
}

/** Same-page (ticket-23): the original sibling-block binding. */
export function isSamePageSource(source: MetricSource): source is MetricSourceSamePage {
  return !isCrossPageSource(source) && !isAggregateSource(source)
}
