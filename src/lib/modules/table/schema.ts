import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

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
})

export type TableRow = z.infer<typeof tableRowSchema>
export type TableBlock = z.infer<typeof tableSchema>

export const tableDescriptor: ModuleDescriptor<TableBlock> = {
  type: 'table',
  schema: tableSchema,
  description:
    'A structured table of rows and columns (plain text cells). Use for inventories, collections, and any list of items with several attributes each (name, quantity, location, …). Never write a markdown table inside a text block — use this instead.',
  // Full rows, not a summary: an edit re-emits the whole block, so the model must
  // see every cell it is expected to preserve.
  serialize: (data) =>
    `${data.title ? `${data.title} — ` : ''}columns: ${data.columns.join(' | ')}; rows: ${data.rows
      .map((r) => r.cells.join(' | '))
      .join(' ; ')}`,
  nestedIdPaths: ['rows'],
}
