/**
 * The ⌘K palette's `records` source (KAN-77, `PondPicker` `typing` / `record`).
 *
 * Records are `type='row'` pages, which `fetchPages` keeps out of the ['pages'] tree
 * on purpose — so the palette searches them itself, per query, and the result never
 * touches that cache. The search is pond-scoped (RLS already scopes to the person;
 * `pond_id` narrows to the pond in view), capped, and lists a record by its title or
 * by the first field whose value matches, which the row's sub-line then names:
 *
 *   `{database}`                         the match is on the title
 *   `{database} · {field}: {value}`      the match is on a field
 *
 * Field values live in `props` jsonb, which PostgREST cannot `ilike` without a cast
 * this codebase does not rely on. So titles are matched in SQL (exact at any volume)
 * and fields over the pond's most recently touched `SCAN_CAP` rows — bounded work
 * per keystroke, at the cost of an old record found by field value alone going
 * unlisted in a very large pond (AUDIT G7).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { PaletteItem } from '@/components/molecules/palette-entries'
import type { Database } from '@/lib/supabase/types'
import {
  optionForValue,
  readSchema,
  readValues,
  ROW_TYPE,
  type PropertyDef,
  type PropertyValue,
} from '@/lib/properties/schema'

/** A one-letter query would match most of a pond. */
export const RECORD_MIN_QUERY = 2
/** Records listed at most — the palette is a jump list, not a results page. */
export const RECORD_LIMIT = 6
const SCAN_CAP = 300

/**
 * A literal for `ilike`. `%`, `_` and `\` are LIKE's own; PostgREST also rewrites
 * `*` to `%` in LIKE values, so a typed `*` is neutralised to a one-character
 * wildcard rather than left to match everything.
 */
export const escapeLike = (text: string): string =>
  text.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_')

interface RecordRow {
  id: string
  parent_id: string | null
  title: string
  props: Record<string, unknown> | null
}

interface DatabaseRow {
  id: string
  title: string
  props: Record<string, unknown> | null
}

const SEARCHABLE: ReadonlySet<PropertyDef['type']> = new Set([
  'text',
  'number',
  'date',
  'select',
  'status',
])

const display = (def: PropertyDef, value: PropertyValue): string => {
  if (def.type === 'select' || def.type === 'status') {
    return optionForValue(def, value)?.label ?? ''
  }
  return value === null || value === undefined ? '' : String(value)
}

/** The first searchable field of `row` whose value contains `q`, in schema order. */
export const matchField = (
  schema: readonly PropertyDef[],
  props: Record<string, unknown> | null,
  q: string
): { name: string; value: string } | null => {
  const values = readValues(props)
  for (const def of schema) {
    if (!SEARCHABLE.has(def.type)) continue
    const value = display(def, values[def.id] as PropertyValue)
    if (value.toLowerCase().includes(q)) return { name: def.name, value }
  }
  return null
}

const recordItem = (
  row: RecordRow,
  database: DatabaseRow | undefined,
  field: { name: string; value: string } | null
): PaletteItem => {
  const where = database?.title || undefined
  const sub = field ? [where, `${field.name}: ${field.value}`].filter(Boolean).join(' · ') : where
  return { id: row.id, label: row.title || 'Untitled', kind: 'record', sub }
}

/** `q` is already trimmed and lowercased, and at least `RECORD_MIN_QUERY` long. */
export async function searchRecords(
  supabase: SupabaseClient<Database>,
  pondId: string,
  q: string,
  limit = RECORD_LIMIT
): Promise<PaletteItem[]> {
  const rows = () =>
    supabase
      .from('pages')
      .select('id, parent_id, title, props')
      .eq('type', ROW_TYPE)
      .eq('pond_id', pondId)
      .order('updated_at', { ascending: false })

  const { data: titled, error } = await rows()
    .ilike('title', `%${escapeLike(q)}%`)
    .limit(limit)
  if (error) throw error
  const byTitle = (titled ?? []) as unknown as RecordRow[]

  let byField: RecordRow[] = []
  if (byTitle.length < limit) {
    const { data: scanned, error: scanError } = await rows().limit(SCAN_CAP)
    if (scanError) throw scanError
    const seen = new Set(byTitle.map((r) => r.id))
    byField = ((scanned ?? []) as unknown as RecordRow[]).filter((r) => !seen.has(r.id))
  }

  const parentIds = [...new Set([...byTitle, ...byField].flatMap((r) => r.parent_id ?? []))]
  const { data: parents, error: parentError } = parentIds.length
    ? await supabase.from('pages').select('id, title, props').in('id', parentIds)
    : { data: [], error: null }
  if (parentError) throw parentError
  const databases = new Map(((parents ?? []) as unknown as DatabaseRow[]).map((d) => [d.id, d]))

  const fieldHits = byField.flatMap((row) => {
    const database = row.parent_id ? databases.get(row.parent_id) : undefined
    const field = matchField(readSchema(database?.props) ?? [], row.props, q)
    return field ? [recordItem(row, database, field)] : []
  })
  const titleHits = byTitle.map((row) =>
    recordItem(row, row.parent_id ? databases.get(row.parent_id) : undefined, null)
  )
  return [...titleHits, ...fieldHits].slice(0, limit)
}
