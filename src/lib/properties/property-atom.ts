/**
 * The properties card's value→atom mapping (KAN-350): what a field's stored value
 * reads as at rest, as a `PondAtom` kind + display string, never a native input.
 * Pure, no React — the card and `Cell` (KAN-350 research: shared surfaces) both
 * read it so a date/select/text value formats identically everywhere.
 *
 * The 8 `PropertyType`s carry no format beyond their type — `money`/`percent`/
 * `duration` are `PondAtom` kinds in the board, not stored property types (see
 * `PROPERTY_TYPES` in `schema.ts`), so a `number` property always maps to the
 * atom's plain `number` kind here. Giving a number field a money/percent/duration
 * format needs a schema field nothing in `PropertyDef` carries yet.
 */
import type { PondAtomKind } from '@/components/atoms/PondAtom'
import { coerceValue, optionForValue, type PropertyDef } from '@/lib/properties/schema'
import { formatAtomDate } from '@/lib/properties/date-input'

/** The atom kind + formatted display string for a field-row value at rest. */
export interface PropertyAtomValue {
  kind: PondAtomKind
  value?: string
  empty: boolean
}

const EMPTY: Pick<PropertyAtomValue, 'value' | 'empty'> = { value: undefined, empty: true }

/** `1,040` — thousands-grouped, no forced decimals (the board's `number` fixture). */
const formatNumber = (n: number): string => new Intl.NumberFormat('en-US').format(n)

/**
 * `propertyAtom(def, raw)` → the `PondAtom` kind and display text for a field's
 * stored value, resolved through {@link coerceValue} so an off-schema/missing raw
 * value reads as `empty` rather than throwing. Mirrors `displayValue` (`apply.ts`)
 * for select/status label resolution, but formats date/number for the atom rather
 * than returning a bare comparable string.
 */
export function propertyAtom(def: PropertyDef, raw: unknown): PropertyAtomValue {
  const value = coerceValue(def, raw)

  switch (def.type) {
    case 'date': {
      if (typeof value !== 'string' || value === '') return { kind: 'date', ...EMPTY }
      return { kind: 'date', value: formatAtomDate(value), empty: false }
    }
    case 'number': {
      if (typeof value !== 'number') return { kind: 'number', ...EMPTY }
      return { kind: 'number', value: formatNumber(value), empty: false }
    }
    case 'select':
    case 'status': {
      if (typeof value !== 'string' || value === '') return { kind: 'tag', ...EMPTY }
      return { kind: 'tag', value: optionForValue(def, value)?.label ?? value, empty: false }
    }
    case 'checkbox':
      return { kind: 'checkbox', value: undefined, empty: false }
    case 'relation': {
      const count = Array.isArray(value) ? value.length : 0
      return count === 0
        ? { kind: 'relation', ...EMPTY }
        : { kind: 'relation', value: String(count), empty: false }
    }
    case 'rollup':
      // Never stored (coerceValue always collapses it to null) — a rollup's
      // computed read is RollupValueField's job, not this pure mapping's.
      return { kind: 'text', ...EMPTY }
    case 'text':
    default: {
      if (typeof value !== 'string' || value === '') return { kind: 'text', ...EMPTY }
      return { kind: 'text', value, empty: false }
    }
  }
}
