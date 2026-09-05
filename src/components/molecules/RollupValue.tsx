'use client'

/**
 * A rollup property's computed value — presentational (#20). The `RollupResult` is
 * injected (a connected wrapper does the fetch + compute); this only formats:
 *   - `count` / `sum` / `average` → a number (integer as-is; a fraction to ≤2dp),
 *     rendered tabular so a column of rollups aligns.
 *   - `min` / `max` over dates → the extreme row's ISO date, as read-mode date cells
 *     already show it.
 *   - `empty` → a faded "—" (unresolvable relation/property, wrong type, or no data).
 *
 * A rollup is DERIVED — never edited — so there is no picker or input here, unlike
 * `RelationValue`. While the underlying rows load, a quiet placeholder holds the slot.
 */

import { cn } from '@/lib/utils'
import type { RollupResult } from '@/lib/modules/view/compute-rollup'

export interface RollupValueProps {
  result: RollupResult
  /** While true, the target rows a value aggregate needs are still loading. */
  loading?: boolean
  className?: string
}

/** Integers print as-is; fractions (an average) trim to ≤2 decimals. */
function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function RollupValue({ result, loading = false, className }: RollupValueProps) {
  if (loading) {
    return (
      <span className={cn('text-press-faint', className)} aria-label="Loading rollup">
        …
      </span>
    )
  }
  if (result.kind === 'empty') {
    return <span className={cn('text-press-faint', className)}>—</span>
  }
  const text = result.kind === 'number' ? formatNumber(result.value) : result.value
  return <span className={cn('tabular-nums text-press-body', className)}>{text}</span>
}
