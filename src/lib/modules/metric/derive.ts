/**
 * Metric derivation (ticket-23, extended ticket-38) — pure, server-safe, no React.
 *
 * A metric may declare an OPTIONAL `source` binding. When bound, its DISPLAYED value is
 * DERIVED live from block state — checking a checklist item, adding a table row, etc.
 * updates the metric immediately. An unbound metric keeps its manual `value`.
 *
 * Three binding shapes, all resolved here into one number:
 *   - same-page   `{ blockId, kind }`            → count over one sibling block (t23)
 *   - cross-page  `{ pageId, blockId, kind }`    → count over one block on ANOTHER page
 *   - aggregate   `{ pages: 'children', kind }`  → SUM the kind across every direct
 *                                                  child page's blocks (t38 rollup)
 *
 * The AI never computes the value: it only declares the binding (which block(s), which
 * kind of count). This module owns the one place that turns a binding + block state into
 * a number, so the view stays declarative and the logic is unit-testable without React.
 *
 * Cross-page and aggregate forms need OTHER pages' blocks, which a pure function cannot
 * fetch. The CLIENT seam (`use-cross-page-metric.tsx`) reads those pages via react-query
 * and passes them in as a `CrossPageBlocks` resolution; while a needed page is still
 * loading it passes `loaded: false` and we return `pending` — a quiet placeholder, NEVER
 * a wrong number.
 */
import type { Block } from '../content'
import type { MetricBlock, MetricSource, MetricSourceKind } from './schema'
// Value import from source-guards (NOT schema): schema.ts value-imports
// deriveMetricValue from this file for its serialize facet, so importing a value
// back from schema here would be a runtime cycle. source-guards has no runtime
// imports, keeping the graph acyclic.
import { isAggregateSource, isCrossPageSource } from './source-guards'

export type DerivedMetric =
  | { state: 'unbound'; value: number }
  | { state: 'derived'; value: number; sourceId: string }
  /** Aggregate rollup: a live SUM across child pages. `pageCount` feeds the scope
   *  caption ("across N pages"); it counts only the child pages actually contributing. */
  | { state: 'aggregate'; value: number; pageCount: number }
  /** Bound, but the source block/page is gone (deleted). Falls back to the manual value. */
  | { state: 'stale'; value: number; sourceId?: string }
  /** Cross-page/aggregate binding whose pages haven't loaded yet. Show a placeholder,
   *  never the manual value dressed up as live, and never a wrong 0. */
  | { state: 'pending' }

/**
 * Cross-page block resolution supplied by the client seam. `loaded` gates the pending
 * state; `blocksByPage` maps a page id → that page's current blocks; `childPageIds`
 * lists the direct child pages (for the aggregate scope). A pure caller (same-page only,
 * serialize, existing tests) omits this entirely.
 */
export interface CrossPageBlocks {
  /** False while any needed page is still fetching → derive returns `pending`. */
  loaded: boolean
  /** Resolved blocks per page id. A missing entry (with loaded:true) means gone/deleted. */
  blocksByPage: ReadonlyMap<string, readonly Block[]>
  /** Direct child page ids of the page holding the metric (aggregate scope). */
  childPageIds: readonly string[]
  /**
   * True when any needed fetch ERRORED (a child page, or the ['pages'] tree for the
   * aggregate scope). An error is not a deletion: an aggregate must not sum the pages
   * that DID load and present a confident under-count (nor caption a shrunken "across
   * N"). Errored → the aggregate falls back to `stale` (manual value + "source
   * missing" note) — chosen over holding `pending` forever because a persistent
   * failure would otherwise pin an eternal placeholder, while `stale` self-heals: the
   * next successful refetch (react-query retries / the standard invalidations)
   * re-derives live. A single cross-page source needs no flag: its errored page is
   * simply absent from the map, which already lands `stale`.
   */
  errored?: boolean
}

/** Compute a count from a resolved block, per the binding `kind`. null = not countable. */
function countFor(kind: MetricSourceKind, block: Block): number | null {
  switch (kind) {
    case 'checklist-checked':
      return block.type === 'todo' ? block.items.filter((i) => i.checked).length : null
    case 'checklist-total':
      return block.type === 'todo' ? block.items.length : null
    case 'table-rows':
      return block.type === 'table' ? block.rows.length : null
    default:
      return null
  }
}

/**
 * Resolve a metric's displayed value against block state.
 *
 * - No `source` → `unbound` (manual value).
 * - Same-page `{ blockId, kind }` → count over the matching sibling; missing/mismatched
 *   → `stale` (manual fallback). This path needs NO cross-page resolution.
 * - Cross-page `{ pageId, blockId, kind }` → needs `cross`; if not loaded → `pending`;
 *   page/block missing or mismatched → `stale`; else `derived`.
 * - Aggregate `{ pages: 'children', kind }` → needs `cross`; not loaded → `pending`;
 *   else SUM the kind across every child page's countable blocks → `aggregate`.
 *
 * A wrong number is never shown: an unresolved page yields `pending`, a gone source
 * yields `stale` (falls back to the manual value), never a bare 0.
 */
export function deriveMetricValue(
  metric: MetricBlock,
  siblings: readonly Block[],
  cross?: CrossPageBlocks
): DerivedMetric {
  const source = metric.source
  if (!source) return { state: 'unbound', value: metric.value }

  if (isAggregateSource(source)) return deriveAggregate(metric, source.kind, cross)
  if (isCrossPageSource(source)) return deriveCrossPage(metric, source, cross)

  // Same-page (ticket-23): resolve against the passed siblings, exactly as before.
  const target = siblings.find((b) => b.id === source.blockId)
  if (!target) return { state: 'stale', value: metric.value, sourceId: source.blockId }
  const count = countFor(source.kind, target)
  if (count === null) return { state: 'stale', value: metric.value, sourceId: source.blockId }
  return { state: 'derived', value: count, sourceId: source.blockId }
}

function deriveCrossPage(
  metric: MetricBlock,
  source: { pageId: string; blockId: string; kind: MetricSourceKind },
  cross: CrossPageBlocks | undefined
): DerivedMetric {
  // No resolution provided, or the page hasn't loaded yet → placeholder, not a guess.
  if (!cross || !cross.loaded) return { state: 'pending' }

  const pageBlocks = cross.blocksByPage.get(source.pageId)
  // Page deleted or unreachable → stale (manual fallback, flagged).
  if (!pageBlocks) return { state: 'stale', value: metric.value, sourceId: source.blockId }

  const target = pageBlocks.find((b) => b.id === source.blockId)
  if (!target) return { state: 'stale', value: metric.value, sourceId: source.blockId }
  const count = countFor(source.kind, target)
  if (count === null) return { state: 'stale', value: metric.value, sourceId: source.blockId }
  return { state: 'derived', value: count, sourceId: source.blockId }
}

function deriveAggregate(
  metric: MetricBlock,
  kind: MetricSourceKind,
  cross: CrossPageBlocks | undefined
): DerivedMetric {
  if (!cross || !cross.loaded) return { state: 'pending' }
  // Any needed fetch errored → NEVER a confident partial sum over the children that
  // did load. Fall back to the manual value, flagged (see the `errored` doc above).
  if (cross.errored) return { state: 'stale', value: metric.value }

  let total = 0
  // A page COUNTS toward the scope caption only if it contributes at least one
  // countable block for this kind — an empty child, or one with no matching block,
  // is not "a milestone page" for this rollup and would inflate the "across N" caption.
  let contributingPages = 0
  for (const pageId of cross.childPageIds) {
    const blocks = cross.blocksByPage.get(pageId)
    if (!blocks) continue // still resolving or gone; loaded-gate above handles the wait
    let pageContributed = false
    for (const block of blocks) {
      const count = countFor(kind, block)
      if (count === null) continue
      total += count
      pageContributed = true
    }
    if (pageContributed) contributingPages += 1
  }
  return { state: 'aggregate', value: total, pageCount: contributingPages }
}

/** True when a source needs OTHER pages' blocks (a cross-page read seam is required). */
export function sourceNeedsCrossPage(source: MetricSource | undefined): boolean {
  return !!source && (isCrossPageSource(source) || isAggregateSource(source))
}
