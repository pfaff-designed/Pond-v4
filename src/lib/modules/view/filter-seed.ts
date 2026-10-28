/**
 * filter-seed.ts — what a record added from a filtered view inherits (KAN-536).
 *
 * Only an `eq` clause names a value worth seeding (every other op — neq/contains/
 * gt/lt — describes a range, not a single value a new row could start with).
 * Within `eq`, only choice/checkbox/text seed: select/status need the target
 * option to still exist in the schema (a stale clause seeds nothing, same
 * leniency as `apply.ts`'s filterRows); date/number/relation/rollup have no safe
 * single value to infer and are left for the caller's own default.
 */
import {
  resolveOptionValue,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import type { ViewFilter } from './schema'

function defById(schema: PropertySchema, id: string): PropertyDef | undefined {
  return schema.find((d) => d.id === id)
}

/** Same truthy regex `apply.ts`'s `matchesFilter` uses for a checkbox target. */
const CHECKBOX_TRUE = /^(true|1|yes|checked)$/i

/** The value an `eq` filter clause seeds a new row with, or `{}` if none applies. */
export function seedFromFilter(
  schema: PropertySchema,
  filter: ViewFilter | undefined
): Record<string, PropertyValue> {
  if (!filter || filter.op !== 'eq') return {}
  const def = defById(schema, filter.property)
  if (!def) return {}

  switch (def.type) {
    case 'select':
    case 'status': {
      const optionId = resolveOptionValue(def, filter.value)
      if (!optionId || !(def.options ?? []).some((o) => o.id === optionId)) return {}
      return { [def.id]: optionId }
    }
    case 'checkbox':
      return { [def.id]: CHECKBOX_TRUE.test(filter.value.trim()) }
    case 'text':
      return { [def.id]: filter.value }
    default:
      return {}
  }
}

/** The option label a usable eq choice filter names, or undefined. */
function filterOptionLabel(schema: PropertySchema, filter?: ViewFilter): string | undefined {
  if (!filter || filter.op !== 'eq') return undefined
  const def = defById(schema, filter.property)
  if (!def || (def.type !== 'select' && def.type !== 'status')) return undefined
  const optionId = resolveOptionValue(def, filter.value)
  const option = (def.options ?? []).find((o) => o.id === optionId)
  return option?.label
}

/** A view's head: the collection name, or `name · <option label>` when it's
 *  filtered to a choice field's option (KAN-536's `tasks · Home Reno`). */
export function filterHead(name: string, schema: PropertySchema, filter?: ViewFilter): string {
  const label = filterOptionLabel(schema, filter)
  return label ? `${name} · ${label}` : name
}

/** `project` is the literal fallback name: `valueLabel` only ever comes from the
 *  tasks database's project filter (KAN-554), so it's the only field this applies to. */
const FALLBACK_FIELD_NAME = 'project'

/** The named empty line when a filter's `valueLabel` no longer resolves to a live
 *  option (option deleted, or the field itself gone) — or undefined otherwise,
 *  including every filter written before `valueLabel` existed. */
export function missingFilterLine(schema: PropertySchema, filter?: ViewFilter): string | undefined {
  if (!filter?.valueLabel) return undefined
  const def = defById(schema, filter.property)
  if (!def) return `no ${FALLBACK_FIELD_NAME} “${filter.valueLabel}” any more`
  if (def.type !== 'select' && def.type !== 'status') return undefined
  const optionId = resolveOptionValue(def, filter.value)
  const option = (def.options ?? []).find((o) => o.id === optionId)
  if (option) return undefined
  return `no ${def.name} “${filter.valueLabel}” any more`
}
