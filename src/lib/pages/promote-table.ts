/**
 * The AI `promote_table` accept path (#29) — framework-agnostic domain logic.
 *
 * A `promote_table` tool call is client-resolved (no execute): the model names an
 * existing freeform `table` block on a page and proposes turning it into a
 * schema-bound collection. The user reviews a proposal card, and ONLY on accept do
 * we write. This module owns that write, converting one table into a collection:
 *
 *   1. inferColumnType / inferSchema — read the table's columns and derive a typed
 *      property schema (all-numeric→number, all-ISO-date→date, else text; mixed→
 *      text). The model never mints ids, so property ids are minted here.
 *   2. tableRowsToPageInputs — turn each table row into a page input: the first
 *      column becomes the page title (so the row is identifiable in every view
 *      mode) AND every column becomes a typed property value keyed by property id.
 *   3. replaceBlockWithView — swap the source `table` block for a `view` block
 *      (table mode) in place, preserving block order and siblings.
 *   4. promoteTableFromProposal — orchestrate: define the schema on the host page
 *      (making it a collection, #18), create a `type='row'` child per data row, and
 *      persist the block swap. Opt-in, one table per card — no bulk migration.
 *
 * No Next.js imports — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import type { TableBlock, TableRow } from '@/lib/modules/table/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { createPage, getPage, defineSchema, saveBlocks } from '@/lib/pages/client'
import {
  coerceValue,
  emptyValue,
  ROW_TYPE,
  type PropertyDef,
  type PropertySchema,
  type PropertyType,
  type PropertyValue,
} from '@/lib/properties/schema'

// ── Column type inference (#29 AC4) ──────────────────────────────────────────

/** A cell counts as numeric when its trimmed, non-empty text parses as a finite
 *  number (plain numerals — a currency/unit prefix falls through to text v1). */
function isNumericCell(s: string): boolean {
  const t = s.trim()
  return t !== '' && Number.isFinite(Number(t))
}

/** A cell counts as a date when it looks like an ISO date (YYYY-MM-DD, optional
 *  time) AND parses to a real calendar date. */
function isIsoDateCell(s: string): boolean {
  const t = s.trim()
  return /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(t) && !Number.isNaN(Date.parse(t))
}

/**
 * Infer a column's property type from its cells (AC4). Blank cells are ignored;
 * a column with at least one non-blank cell is `number` when every non-blank cell
 * is numeric, `date` when every non-blank cell is an ISO date (numeric checked
 * first, so a bare-year column reads as number), otherwise `text`. An all-blank or
 * empty column defaults to `text`.
 */
export function inferColumnType(cells: string[]): PropertyType {
  const filled = cells.map((c) => c ?? '').filter((c) => c.trim() !== '')
  if (filled.length === 0) return 'text'
  if (filled.every(isNumericCell)) return 'number'
  if (filled.every(isIsoDateCell)) return 'date'
  return 'text'
}

/**
 * Derive a collection's property schema from a table's columns + rows (AC1). One
 * property per column, in column order, each carrying a freshly minted stable id
 * (the model never mints ids), the column header as its name, and the type
 * inferred from that column's cells across all rows. Only text/number/date are
 * inferred this pass (select/status/relation are out of scope — #29).
 */
export function inferSchema(
  columns: string[],
  rows: readonly TableRow[],
  mintId: () => string
): PropertySchema {
  return columns.map((name, col) => ({
    id: mintId(),
    name,
    type: inferColumnType(rows.map((r) => r.cells[col] ?? '')),
  }))
}

// ── Rows → pages (#29 AC2) ────────────────────────────────────────────────────

/** A page to create for one promoted table row — its title + typed value map. */
export interface RowPageInput {
  title: string
  props: Record<string, PropertyValue>
}

/** Convert one table cell to a property's typed value. A number column parses the
 *  numeral string (blank/unparseable → null); text/date keep the string (leniently
 *  coerced). Never throws — a bad cell collapses to the type's empty. */
function cellToValue(def: PropertyDef, cell: string | undefined): PropertyValue {
  const s = (cell ?? '').trim()
  if (s === '') return emptyValue(def)
  if (def.type === 'number') {
    const n = Number(s)
    return Number.isFinite(n) ? n : emptyValue(def)
  }
  // text and date are stored as strings — coerceValue validates/keeps them.
  return coerceValue(def, s)
}

/**
 * Map a table's rows onto page inputs against the inferred schema (AC2). Each row
 * becomes a page whose title is its first cell (kept identifiable in board/gallery/
 * gantt views, which render the title) and whose props hold every column's coerced
 * value keyed by the matching property's id. A short row's missing trailing cells
 * become empty values.
 */
export function tableRowsToPageInputs(
  schema: PropertySchema,
  rows: readonly TableRow[]
): RowPageInput[] {
  return rows.map((row) => {
    const props: Record<string, PropertyValue> = {}
    schema.forEach((def, col) => {
      props[def.id] = cellToValue(def, row.cells[col])
    })
    return { title: (row.cells[0] ?? '').trim(), props }
  })
}

// ── Block swap (#29 AC3) ──────────────────────────────────────────────────────

/**
 * Replace the `table` block with the given `view` block in place, preserving order
 * and every sibling block (AC3). A no-op (returns the same-shaped array) when the
 * target id is absent, so a stale accept can't drop content.
 */
export function replaceBlockWithView(
  blocks: Block[],
  tableBlockId: string,
  view: ViewBlock
): Block[] {
  return blocks.map((b) => ((b as { id?: string }).id === tableBlockId ? (view as Block) : b))
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/** A promote_table proposal after the user has (optionally) confirmed its target. */
export interface PromoteTableProposal {
  /** The page hosting the freeform table block. */
  pageId: string
  /** The id of the `table` block to convert. Omitted → the page's sole table block. */
  blockId?: string
}

export interface PromotedTable {
  /** The collection the table became (the host page itself). */
  collectionId: string
  /** The id of the `view` block that replaced the table. */
  viewBlockId: string
  /** How many `type='row'` child pages were created. */
  rowCount: number
}

/** Locate the table block to promote: the named block (must be a table) or, when
 *  unnamed, the page's sole table block. Throws when there is no unambiguous one. */
function pickTableBlock(blocks: Block[], blockId?: string): TableBlock {
  if (blockId) {
    const found = blocks.find((b) => (b as { id?: string }).id === blockId)
    if (!found || (found as { type?: string }).type !== 'table') {
      throw new Error(`Cannot promote: block ${blockId} is not a table block`)
    }
    return found as unknown as TableBlock
  }
  const tables = blocks.filter((b) => (b as { type?: string }).type === 'table')
  if (tables.length === 0) throw new Error('Cannot promote: the page has no table block')
  if (tables.length > 1) {
    throw new Error('Cannot promote: the page has more than one table block; name which to convert')
  }
  return tables[0] as unknown as TableBlock
}

/**
 * Write an accepted promote_table proposal (AC1-3). Confirms the host page exists
 * and carries the target table, infers the schema and defines it on the page (the
 * act that makes it a collection, #18 — merge-safe, existing props preserved),
 * creates a `type='row'` child per data row with its values coerced to the schema,
 * and replaces the table block with a `view` block (table mode) in place. Throws on
 * a missing page or an absent/wrong-typed target block, so the card can revert
 * rather than silently no-op.
 */
export async function promoteTableFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: PromoteTableProposal,
  mintId: () => string,
  workspace: WorkspaceScope = 'main'
): Promise<PromotedTable> {
  const page = await getPage(supabase, proposal.pageId)
  if (!page) throw new Error(`Cannot promote a table: page ${proposal.pageId} was not found`)

  const table = pickTableBlock(page.blocks, proposal.blockId)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // 1. Infer + define the schema — this makes the host page a collection.
  const schema = inferSchema(table.columns, table.rows, mintId)
  await defineSchema(supabase, proposal.pageId, schema)

  // 2. Each data row becomes a type='row' child carrying its coerced values.
  const rowInputs = tableRowsToPageInputs(schema, table.rows)
  for (const input of rowInputs) {
    await createPage(supabase, user.id, {
      parentId: proposal.pageId,
      type: ROW_TYPE,
      title: input.title,
      props: input.props,
      workspace,
    })
  }

  // 3. Swap the table block for a table-mode view in place.
  const view: ViewBlock = { id: mintId(), type: 'view', mode: 'table' }
  const blocks = replaceBlockWithView(page.blocks, table.id, view)
  await saveBlocks(supabase, proposal.pageId, blocks)

  return { collectionId: proposal.pageId, viewBlockId: view.id, rowCount: rowInputs.length }
}
