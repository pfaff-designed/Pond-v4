/**
 * View row math (#19 slice 3) — the PURE filter / sort / group core a view runs
 * over its collection's rows, kept apart from the React renderer so it's directly
 * unit-testable and shared by every mode (table filters+sorts; board additionally
 * groups the already-filtered+sorted rows).
 *
 * Single-clause only (decision 15): one `filter`, one `sort` key, one `groupBy`
 * property. Everything is resolved through the collection's `_schema` so a
 * select/status value (a stored option *id*, slice 1) compares and buckets by the
 * right identity — with `optionForValue`'s legacy-label tolerance underneath so a
 * pre-resolution row never falls through. Nothing here throws: a stale/off-schema
 * value degrades (sorts last, lands in the "no value" bucket) rather than failing a
 * render — the same leniency as the read path (#18 decision 9).
 */
import {
  coerceValue,
  optionForValue,
  resolveOptionValue,
  type PropertyDef,
  type PropertySchema,
} from '@/lib/properties/schema'
import type { ViewFilter, ViewSort } from './schema'

/**
 * A collection row reduced to what the view draws: the row page's id + title, and
 * its typed property *values* (the `props` value map, schema stripped — see
 * `readValues`). Values are raw-as-stored; resolution to labels/chips happens here
 * and in the renderer via the schema, never baked into the row.
 */
export interface CollectionRow {
  id: string
  title: string
  values: Record<string, unknown>
}

/** Look a property up in the schema by id. */
function defById(schema: PropertySchema, id: string): PropertyDef | undefined {
  return schema.find((d) => d.id === id)
}

/**
 * A value reduced to a single comparable primitive for sort/filter, per its type:
 * number → the number; checkbox → 0/1; select/status → the option's label (so
 * ordering/`contains` read naturally, not by opaque id); date/text → the lowercased
 * string. An empty/unset value returns `null` — callers sort those last and treat
 * them as non-matching for value filters.
 */
function comparable(def: PropertyDef, raw: unknown): string | number | null {
  const value = coerceValue(def, raw)
  if (value === null || value === '') return null
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? value : null
    case 'checkbox':
      return value ? 1 : 0
    case 'select':
    case 'status': {
      const opt = optionForValue(def, value)
      return (opt?.label ?? String(value)).toLowerCase()
    }
    case 'date':
      // ISO date/datetime strings sort chronologically as plain strings.
      return String(value)
    default:
      return String(value).toLowerCase()
  }
}

/**
 * Does a row's value satisfy the single filter clause? Choice properties compare
 * by option *id* for eq/neq (so a filter written by label or id both land), and by
 * option *label* for `contains`; numbers compare numerically; everything else by
 * string. An empty row value never matches a value comparison (except `neq`, which
 * it satisfies) — an absent value is genuinely "not equal".
 */
function matchesFilter(
  def: PropertyDef,
  raw: unknown,
  op: ViewFilter['op'],
  target: string
): boolean {
  const isChoice = def.type === 'select' || def.type === 'status'

  if (op === 'eq' || op === 'neq') {
    let a: string | number | null
    let b: string | number | null
    if (isChoice) {
      // Normalise both sides to option ids so label-vs-id never causes a miss.
      const rawId = resolveOptionValue(def, raw)
      a = rawId
      b = resolveOptionValue(def, target)
    } else {
      a = comparable(def, raw)
      b = comparable(def, target === '' ? null : target)
      // For non-choice, coerce the target through the same type lens as the value.
      if (def.type === 'number') b = target.trim() === '' ? null : Number(target)
      if (def.type === 'checkbox') b = /^(true|1|yes|checked)$/i.test(target.trim()) ? 1 : 0
    }
    const equal = a === b
    return op === 'eq' ? equal : !equal
  }

  if (op === 'contains') {
    const hay = isChoice
      ? (optionForValue(def, coerceValue(def, raw))?.label ?? String(coerceValue(def, raw) ?? ''))
      : String(coerceValue(def, raw) ?? '')
    return hay.toLowerCase().includes(target.toLowerCase())
  }

  // gt / lt — numeric when both sides are numbers, else lexical on the comparable.
  const a = comparable(def, raw)
  if (a === null) return false
  const b: string | number = def.type === 'number' ? Number(target) : String(target).toLowerCase()
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(b)) return false
    return op === 'gt' ? a > b : a < b
  }
  const as = String(a)
  const bs = String(b)
  return op === 'gt' ? as > bs : as < bs
}

/** Keep only the rows matching the filter clause. No clause → all rows, in order. */
export function filterRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  filter?: ViewFilter
): CollectionRow[] {
  if (!filter) return [...rows]
  const def = defById(schema, filter.property)
  // A filter on an unknown property is inert (shows everything) rather than empty —
  // a stale clause must not silently blank the view.
  if (!def) return [...rows]
  return rows.filter((r) => matchesFilter(def, r.values[filter.property], filter.op, filter.value))
}

/**
 * Sort rows by the single sort key. Stable: rows with an empty value for the key
 * always sink to the bottom regardless of direction (a blank cell is never the
 * "smallest"); the rest order by their comparable, ascending or descending.
 */
export function sortRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  sort?: ViewSort
): CollectionRow[] {
  if (!sort) return [...rows]
  const def = defById(schema, sort.key)
  if (!def) return [...rows]
  const dir = sort.dir === 'desc' ? -1 : 1
  return [...rows].sort((ra, rb) => {
    const a = comparable(def, ra.values[sort.key])
    const b = comparable(def, rb.values[sort.key])
    if (a === null && b === null) return 0
    if (a === null) return 1 // empties last, both directions
    if (b === null) return -1
    if (a < b) return -1 * dir
    if (a > b) return 1 * dir
    return 0
  })
}

/** Filter then sort — the row pipeline every mode runs before it draws. */
export function applyView(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  config: { filter?: ViewFilter; sort?: ViewSort }
): CollectionRow[] {
  return sortRows(filterRows(rows, schema, config.filter), schema, config.sort)
}

/** One board column: an option bucket (or the trailing "no value" bucket, id null). */
export interface ViewGroup {
  /** The option id this column collects, or null for the unset/unmatched bucket. */
  id: string | null
  label: string
  /** Option token/hex for the header dot; absent on the null bucket. */
  color?: string
  rows: CollectionRow[]
}

/**
 * Bucket rows by a select/status property for the board (decision 14). One column
 * per schema option in schema order, plus a trailing "No <name>" bucket for rows
 * whose value is empty or points at an option no longer in the schema — so every
 * row is placed exactly once and none is dropped. Returns null when `groupById`
 * doesn't name a select/status property (the board can't group by anything else).
 */
export function groupRows(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  groupById: string | undefined
): { def: PropertyDef; groups: ViewGroup[] } | null {
  if (!groupById) return null
  const def = defById(schema, groupById)
  if (!def || (def.type !== 'select' && def.type !== 'status')) return null

  const options = def.options ?? []
  const byOption = new Map<string, CollectionRow[]>(options.map((o) => [o.id, []]))
  const unset: CollectionRow[] = []

  for (const row of rows) {
    const opt = optionForValue(def, coerceValue(def, row.values[groupById]))
    if (opt && byOption.has(opt.id)) byOption.get(opt.id)!.push(row)
    else unset.push(row)
  }

  const groups: ViewGroup[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    color: o.color,
    rows: byOption.get(o.id) ?? [],
  }))
  groups.push({ id: null, label: `No ${def.name}`, rows: unset })
  return { def, groups }
}

/** The display string for a value in a cell/chip — the read-side of `comparable`,
 *  but preserving original case (comparable lowercases for ordering). Empty → ''. */
export function displayValue(def: PropertyDef, raw: unknown): string {
  const value = coerceValue(def, raw)
  if (value === null || value === '') return ''
  switch (def.type) {
    case 'checkbox':
      return value ? '✓' : ''
    case 'select':
    case 'status':
      return optionForValue(def, value)?.label ?? String(value)
    case 'relation':
      return Array.isArray(value) ? String(value.length) : ''
    default:
      return String(value)
  }
}
