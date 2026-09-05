'use client'

/**
 * The connected rollup field (#20) — the one fetch boundary for a rollup value. A
 * rollup reads a sibling relation on the same row: the host resolves that relation's
 * def (by `def.relationId`) and its stored value (the linked ids) from the row it
 * already holds, and passes them here. `useRollup` fetches the target collection's
 * rows + schema and computes; the result is handed to the presentational
 * `RollupValue`. This is the ONLY rollup piece that touches data — the view `Cell`
 * and `PropertyInspector` render it in their rollup branch and otherwise stay
 * presentational. Read-only: a rollup is derived, never edited.
 */

import { RollupValue } from '@/components/molecules/RollupValue'
import { useRollup } from '@/lib/modules/view/use-rollup'
import type { PropertyDef, PropertyValue } from '@/lib/properties/schema'

export interface RollupValueFieldProps {
  /** The rollup property def. */
  def: PropertyDef
  /** The sibling relation def named by `def.relationId` (undefined → unresolved → "—"). */
  relationDef?: PropertyDef
  /** That relation's stored value on THIS row (the linked page-ids). */
  relationValue: PropertyValue
  className?: string
}

export function RollupValueField({
  def,
  relationDef,
  relationValue,
  className,
}: RollupValueFieldProps) {
  const { result, loading } = useRollup(def, relationValue, relationDef)
  return <RollupValue result={result} loading={loading} className={className} />
}
