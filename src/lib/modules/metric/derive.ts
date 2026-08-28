/**
 * Metric derivation (ticket-23) — pure, server-safe, no React.
 *
 * A metric may declare an OPTIONAL `source` binding pointing at a sibling block in
 * the same page. When bound, its DISPLAYED value is DERIVED live from that block's
 * current state — checking a checklist item, adding a table row, etc. updates the
 * metric immediately. An unbound metric keeps its manual `value` unchanged.
 *
 * The AI never computes the value: it only declares the binding (which block, which
 * kind of count). This module owns the one place that turns a binding + the sibling
 * block into a number, so the view stays declarative and the logic is unit-testable
 * without React.
 */
import type { Block } from '../content'
import type { MetricBlock, MetricSource } from './schema'

export type DerivedMetric =
  | { state: 'unbound'; value: number }
  | { state: 'derived'; value: number; sourceId: string }
  /** Bound, but the source block is gone (deleted). Falls back to the manual value. */
  | { state: 'stale'; value: number; sourceId: string }

/** Compute a count from a resolved sibling block, per the binding `kind`. */
function countFor(kind: MetricSource['kind'], block: Block): number | null {
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
 * Resolve a metric's displayed value against its sibling blocks.
 *
 * - No `source` → `unbound`, shows the manual `value`.
 * - `source` present, target found, kind applies → `derived`, shows the live count.
 * - `source` present but target missing, deleted, or type-mismatched → `stale`,
 *   falls back to the manual `value` (never crashes, never shows a wrong 0).
 */
export function deriveMetricValue(metric: MetricBlock, siblings: readonly Block[]): DerivedMetric {
  const source = metric.source
  if (!source) return { state: 'unbound', value: metric.value }

  const target = siblings.find((b) => b.id === source.blockId)
  if (!target) return { state: 'stale', value: metric.value, sourceId: source.blockId }

  const count = countFor(source.kind, target)
  if (count === null) return { state: 'stale', value: metric.value, sourceId: source.blockId }

  return { state: 'derived', value: count, sourceId: source.blockId }
}
