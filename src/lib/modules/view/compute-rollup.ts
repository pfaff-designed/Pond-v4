/**
 * Pure rollup computation (#20). A rollup aggregates one property across the rows a
 * relation links to — see `wayfinder/SPEC-relation-rollups.md`. This is the whole
 * compute: no I/O, no React. The hook (`useRollup`) fetches the target rows from the
 * shared `['rows', targetId]` cache and hands them here.
 *
 * Posture is tolerate-don't-crash (matching the relation half): a missing aggregate,
 * unresolvable/wrong-type target property, or empty value set collapses to `empty`
 * ("—") rather than throwing or coercing garbage. Per-row missing values are skipped,
 * not read as 0 — so an empty cell never drags an average or masquerades as a min.
 */
import { coerceValue, type PropertyDef, type PropertySchema } from '@/lib/properties/schema'

/** The minimal row shape a rollup needs — `PondPage` satisfies it structurally. */
export interface RollupRow {
  id: string
  props: Record<string, unknown>
}

/** The computed result, discriminated so the renderer formats without re-deriving type. */
export type RollupResult =
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: string } // ISO string of the extreme row (min/max over dates)
  | { kind: 'empty' } // render as "—"

const EMPTY: RollupResult = { kind: 'empty' }

/**
 * Aggregate `def`'s rollup over the rows named by `linkedIds` (the parent relation's
 * stored value), reading `def.rollupProperty` off each linked row in `targetRows`.
 *
 * - `count` is the one aggregate that ignores rows/schema entirely: it is the number
 *   of linked pages, so it works over an untargeted relation.
 * - value aggregates require a resolvable, type-compatible target property; otherwise
 *   `empty`. `sum` of nothing is `0` (identity); `average`/`min`/`max` of nothing is `empty`.
 */
export function computeRollup(
  def: PropertyDef,
  linkedIds: string[],
  targetRows: RollupRow[],
  targetSchema: PropertySchema | null
): RollupResult {
  const aggregate = def.aggregate
  if (!aggregate) return EMPTY

  if (aggregate === 'count') return { kind: 'number', value: linkedIds.length }

  const propId = def.rollupProperty
  if (!propId || !targetSchema) return EMPTY
  const propDef = targetSchema.find((p) => p.id === propId)
  if (!propDef) return EMPTY

  const wantsNumber = aggregate === 'sum' || aggregate === 'average'
  if (wantsNumber && propDef.type !== 'number') return EMPTY
  if (
    (aggregate === 'min' || aggregate === 'max') &&
    propDef.type !== 'number' &&
    propDef.type !== 'date'
  ) {
    return EMPTY
  }

  const rowsById = new Map(targetRows.map((r) => [r.id, r]))

  if (propDef.type === 'number') {
    const nums: number[] = []
    for (const id of linkedIds) {
      const row = rowsById.get(id)
      if (!row) continue
      const v = coerceValue(propDef, row.props[propId])
      if (typeof v === 'number') nums.push(v)
    }
    if (aggregate === 'sum') return { kind: 'number', value: nums.reduce((a, b) => a + b, 0) }
    if (nums.length === 0) return EMPTY
    if (aggregate === 'average')
      return { kind: 'number', value: nums.reduce((a, b) => a + b, 0) / nums.length }
    return { kind: 'number', value: aggregate === 'min' ? Math.min(...nums) : Math.max(...nums) }
  }

  // propDef.type === 'date', aggregate ∈ {min, max}
  const dates: string[] = []
  for (const id of linkedIds) {
    const row = rowsById.get(id)
    if (!row) continue
    const v = coerceValue(propDef, row.props[propId])
    if (typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v))) dates.push(v)
  }
  if (dates.length === 0) return EMPTY
  const sorted = [...dates].sort((a, b) => Date.parse(a) - Date.parse(b))
  return { kind: 'date', value: aggregate === 'min' ? sorted[0] : sorted[sorted.length - 1] }
}
