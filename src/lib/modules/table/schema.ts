import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { sumColumn as sumTableColumn } from './sum'

/** One table row. Rows carry their own stable ids for targeted edits (like todo items). */
export const tableRowSchema = z.object({
  id: z.string(),
  /** One cell per column, in column order. Plain strings — this is a content block,
   *  not a spreadsheet engine (no cell types, no formulas). */
  cells: z.array(z.string()),
})

/**
 * A structured table: column headers + rows of string cells. The primitive that
 * stops inventories/collections being faked as markdown tables inside text blocks
 * (build-brief finding A). Shape chosen by scripts/proto-table.mts: `{cells}` row
 * objects beat flat string[][] because persisted rows need minted ids, so the
 * AI-emitted shape stays identical to the persisted shape minus ids (todo pattern).
 */
export const tableSchema = z.object({
  id: z.string(),
  type: z.literal('table'),
  /** Optional short caption shown above the table. */
  title: z.string().optional(),
  columns: z.array(z.string()).min(1),
  rows: z.array(tableRowSchema),
  /**
   * Optional sum footer (ticket-31). The 0-based index of a numeric column to total
   * in a footer row. Cells are parsed leniently ("$459 (bought!)" → 459, "$20–60" →
   * midpoint 40); non-numeric cells are skipped, not counted as zero. Enable it for
   * budget/price/quantity tables so the total lives ON the page, not just in chat.
   * Omit for tables with no column worth summing.
   */
  sumColumn: z.number().int().nonnegative().optional(),
})

export type TableRow = z.infer<typeof tableRowSchema>
export type TableBlock = z.infer<typeof tableSchema>

export const tableDescriptor: ModuleDescriptor<TableBlock> = {
  type: 'table',
  label: 'table',
  paletteDescription: 'rows and columns for things with several fields each',
  schema: tableSchema,
  description:
    'A structured table of rows and columns (plain text cells). Use for inventories, collections, and any list of items with several attributes each (name, quantity, location, …). Never write a markdown table inside a text block — use this instead. ' +
    'For a budget, price list, or any table with a column of money/quantities worth totalling, set `sumColumn` to that column\'s 0-based index: the page then shows a live TOTAL footer that reparses as cells are edited ("$459 (bought!)" counts as 459). Do NOT hand-write a total row — use `sumColumn` so the number stays live.',
  // Full rows, not a summary: an edit re-emits the whole block, so the model must
  // see every cell it is expected to preserve. When a sum footer is enabled, append
  // the derived column total so the AI's context + embeddings match the page.
  serialize: (data) => {
    const body = `${data.title ? `${data.title} — ` : ''}columns: ${data.columns.join(
      ' | '
    )}; rows: ${data.rows.map((r) => r.cells.join(' | ')).join(' ; ')}`
    if (data.sumColumn === undefined) return body
    const { total, counted } = sumTableColumn(data.rows, data.sumColumn)
    if (counted === 0) return body
    return `${body}; total ${data.columns[data.sumColumn] ?? `column ${data.sumColumn}`}: ${total}`
  },
  nestedIdPaths: ['rows'],
}
