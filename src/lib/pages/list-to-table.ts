/**
 * The user's own list → table gesture (#101; board 6j "turn a list into a
 * table") — framework-agnostic domain logic.
 *
 * The block handle's "turn into › table" converts a LIST block in place. Unlike
 * `promote-table.ts` (the AI's proposal, written only on accept) this is the
 * person's own edit, so it applies at once with undo — no proposal card. And per
 * PROJECT_RULES ("a table is always a view of a database") + AUDIT § Decided 26
 * sep (6j), the table is not a freeform `table` block: the conversion CREATES a
 * real database from the list's rows, filed under the `databases` root, and the
 * block becomes a `view` (table mode) of that database.
 *
 *   1. listItems — is this block a list, and what are its lines?
 *   2. inferListTable — the pattern in the lines becomes columns (6j frame 3:
 *      "an amount, a unit and a thing" → amount · unit · item). Lines that don't
 *      fit keep their text in the last column — nothing lost.
 *   3. field types — promote-table's existing inference (number / date / text),
 *      so every field is one of the 8 property types in properties/schema.ts.
 *   4. createDatabaseFromList — orchestrate the writes: `createDatabase` (#280:
 *      the root and the database page with its schema, one owner), then a
 *      `type='row'` record per line; return the view block. The HOST page's block swap is the caller's (the controlled editor
 *      owns persistence — see BlockCanvas), composed via `replaceBlockWithView`.
 *
 * No Next.js imports — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { TableRow } from '@/lib/modules/table/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { createPage } from '@/lib/pages/client'
import { createDatabase, rollbackDatabase } from '@/lib/pages/create-database'
import { inferSchema, tableRowsToPageInputs } from '@/lib/pages/promote-table'
import { ROW_TYPE, type PropertySchema } from '@/lib/properties/schema'

// ── 1. What is a list ────────────────────────────────────────────────────────

/** A markdown list line: `- `, `* `, `+ `, `• ` or `1.` / `1)` then the item. */
const LIST_LINE = /^\s*(?:[-*+•]|\d+[.)])\s+(.*\S)\s*$/

/**
 * The items of a list block, or null when the block is not a list. A text block
 * is a list when every non-blank line is a list line and there is at least one
 * — prose, a heading, or a heading-then-bullets block is not (the heading above
 * a list is its own block, which is what names the database; see
 * {@link inferListDatabaseTitle}).
 */
export function listItems(block: Block): string[] | null {
  if (block.type !== 'text') return null
  const lines = block.content.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) return null
  const items: string[] = []
  for (const line of lines) {
    const m = LIST_LINE.exec(line)
    if (!m) return null
    items.push(m[1])
  }
  return items
}

// ── 2. Columns from the pattern in the lines (6j frame 3) ────────────────────

/** A table shape before ids/types: column names + string cells per row. */
export interface ListTable {
  columns: string[]
  rows: string[][]
}

/**
 * Unit words a line may carry with a space after its amount ("2 cups rice"). A
 * unit ATTACHED to the number ("500g", "78%") needs no list; a spaced word is
 * taken as a unit only from here, so "2 eggs large" keeps "eggs large" as the
 * thing rather than reading eggs as a unit.
 */
const UNIT_WORDS = new Set([
  'g',
  'kg',
  'mg',
  'ml',
  'cl',
  'dl',
  'l',
  'oz',
  'lb',
  'lbs',
  'tsp',
  'tbsp',
  'cup',
  'cups',
  'pinch',
  'pcs',
  'pc',
  'x',
  'min',
  'mins',
  'h',
  'hr',
  'hrs',
  'sec',
  's',
  'km',
  'm',
  'cm',
  'mm',
  'mi',
  'ft',
  'in',
  '%',
  '°c',
  '°f',
])

/**
 * `500g strong white flour` → amount 500, unit g, item strong white flour. A
 * comma decimal separator is accepted ("1,5 l milk") and normalised to a point by
 * {@link parseAmountLine} — `inferColumnType` reads a cell as a number only
 * through `Number()`, for which "1,5" is NaN, so a comma left in place would type
 * the amount column as text.
 */
const AMOUNT_LINE = /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z%°]{1,4})?(?:\s+(.*))?$/

interface AmountParts {
  amount: string
  unit: string
  item: string
}

/** Read "an amount, a unit and a thing" off one line, or null when it has none. */
function parseAmountLine(line: string): AmountParts | null {
  const m = AMOUNT_LINE.exec(line.trim())
  if (!m) return null
  const matched = m[1]
  let unit = m[2] ?? ''
  let item = (m[3] ?? '').trim()
  // A unit the regex split off with a space must be a known unit word; otherwise
  // it was the start of the thing itself ("2 eggs" → eggs is the item). Measured
  // against the text AS WRITTEN, before the separator is normalised below.
  const attached = unit !== '' && line.trim().startsWith(matched + unit)
  if (unit !== '' && !attached && !UNIT_WORDS.has(unit.toLowerCase())) {
    item = item === '' ? unit : `${unit} ${item}`
    unit = ''
  }
  if (item === '') return null
  // One decimal separator downstream: the cell must satisfy `Number()` for the
  // column to type as `number` (see AMOUNT_LINE), so "1,5" is stored as "1.5".
  return { amount: matched.replace(',', '.'), unit, item }
}

/**
 * Infer the table a list becomes. When at least half the lines read as "an
 * amount, a unit and a thing", the columns are `amount · unit · item` (`unit`
 * dropped when no line carries one) and a non-matching line keeps its whole text
 * in the last column. Otherwise the list is one `item` column, a row per line.
 * Column names are Pond's lowercase register (frame 3: amount / unit / item).
 */
export function inferListTable(items: string[]): ListTable {
  const parsed = items.map(parseAmountLine)
  const matched = parsed.filter((p): p is AmountParts => p !== null)
  if (matched.length === 0 || matched.length * 2 < items.length) {
    return { columns: ['item'], rows: items.map((line) => [line.trim()]) }
  }
  const hasUnit = matched.some((p) => p.unit !== '')
  const columns = hasUnit ? ['amount', 'unit', 'item'] : ['amount', 'item']
  const rows = items.map((line, i) => {
    const p = parsed[i]
    if (!p) return hasUnit ? ['', '', line.trim()] : ['', line.trim()]
    return hasUnit ? [p.amount, p.unit, p.item] : [p.amount, p.item]
  })
  return { columns, rows }
}

/**
 * The handle menu's preview — "4 rows · 3 columns" (frame 2: "the row says what
 * will come out"). Null when the block is not a list, so no table is offered.
 */
export function previewListTable(block: Block): { rows: number; columns: number } | null {
  const items = listItems(block)
  if (!items) return null
  const table = inferListTable(items)
  return { rows: table.rows.length, columns: table.columns.length }
}

/**
 * Name the database after the one-line heading sitting directly above the list
 * (frame 3's "ingredients"), else after the host page. A heading is a single
 * short text line (markdown `#`s and emphasis stripped) that is not itself a
 * list line. Never empty.
 */
export function inferListDatabaseTitle(blocks: Block[], index: number, pageTitle: string): string {
  const above = index > 0 ? blocks[index - 1] : undefined
  if (above && above.type === 'text') {
    const lines = above.content.split('\n').filter((l) => l.trim() !== '')
    if (lines.length === 1 && !LIST_LINE.test(lines[0])) {
      const heading = lines[0]
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/[*_`]/g, '')
        .trim()
      if (heading !== '' && heading.length <= 60) return heading
    }
  }
  const fallback = pageTitle.trim()
  return fallback === '' ? 'Untitled' : fallback
}

// ── 4. Orchestrator ──────────────────────────────────────────────────────────

export interface CreateDatabaseFromListInput {
  /** #312: the pond this writes into. Required — see `CreatePageInput.pondId`. */
  pondId: string | null
  /** The list block being turned into a table. */
  block: Block
  /** The new database's title (see {@link inferListDatabaseTitle}). */
  title: string
}

export interface DatabaseFromList {
  /** The view block (table mode, linked to the database) that replaces the list. */
  view: ViewBlock
  /** The collection page the rows went into — the new database. */
  databaseId: string
  /** The databases root it was filed under. */
  databasesRootId: string
  /** How many records (type='row' children) were created. */
  rowCount: number
  /** The inferred schema, for the caller's receipt. */
  schema: PropertySchema
}

/**
 * Write the database a list becomes (AC2-4): the databases root (created on first
 * use), a collection page under it carrying the inferred schema, and one
 * `type='row'` record per line with its values coerced to the field types —
 * then return the `view` block that stands in for the list. Each record is
 * titled by the list's identifying text column (the last one), so it reads in
 * every view mode. Throws on a non-list block or when unauthenticated, before
 * writing anything, so the editor can leave the page untouched.
 *
 * Writes are not transactional (one insert per row over the client), so a failure
 * part-way is rolled back by {@link rollbackDatabase} before the error is
 * rethrown: it is all-or-nothing from the user's side, never a database with
 * three of its four rows sitting under databases.
 */
export async function createDatabaseFromList(
  supabase: SupabaseClient<Database>,
  input: CreateDatabaseFromListInput,
  mintId: () => string
): Promise<DatabaseFromList> {
  const items = listItems(input.block)
  if (!items) throw new Error('Cannot turn into a table: the block is not a list')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const table = inferListTable(items)
  const rows: TableRow[] = table.rows.map((cells) => ({ id: mintId(), cells }))
  // Field types via promote-table's inference — bounded to the 8 property types.
  const schema = inferSchema(table.columns, rows, mintId)

  // The root and the collection page are the shared sequence (#280); only the
  // records are this gesture's own.
  const made = await createDatabase(
    supabase,
    { title: input.title, schema, pondId: input.pondId },
    mintId
  )
  try {
    const titleCol = table.columns.length - 1
    const inputs = tableRowsToPageInputs(schema, rows, titleCol)
    for (const row of inputs) {
      await createPage(supabase, user.id, {
        parentId: made.databaseId,
        type: ROW_TYPE,
        title: row.title,
        props: row.props,
        pondId: input.pondId,
      })
    }
    return {
      view: made.view,
      databaseId: made.databaseId,
      databasesRootId: made.databasesRootId,
      rowCount: inputs.length,
      schema,
    }
  } catch (err) {
    await rollbackDatabase(
      supabase,
      made.databaseId,
      made.rootCreated ? made.databasesRootId : null
    )
    throw err
  }
}
