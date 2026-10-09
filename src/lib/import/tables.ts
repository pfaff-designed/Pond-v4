/**
 * Tables (6z frame 3): "a table with dates, or rows you’ll add to, becomes a
 * database with a table view. A short table of facts stays a table block."
 *
 * Columns are typed by the field engine's own reading of a column
 * (`promote-table.ts`), the same one `promote_table` and list → table use, so an
 * imported table and a promoted one can never type the same cells differently.
 */
import type { Element } from 'hast'
import type { TableBlock, TableRow } from '@/lib/modules/table/schema'
import { inferColumnType, inferSchema, tableRowsToPageInputs } from '@/lib/pages/promote-table'
import type { RowPageInput } from '@/lib/pages/promote-table'
import type { PropertySchema } from '@/lib/properties/schema'
import { childElements, plainText, prop } from './hast'
import type { TableReason } from './types'

/** "More than 8 rows or a date column" makes a database. */
const DATABASE_ABOVE_ROWS = 8
/** How many rows either side of the line count as borderline, for the question step. */
const BORDERLINE_ROWS = 2

/** A cell's words, and the value a field reads (a `<time>`'s machine date). */
export interface TableCell {
  text: string
  value: string
}

export interface TableReading {
  columns: string[]
  rows: TableCell[][]
  caption?: string
}

const ROW_GROUPS = new Set(['thead', 'tbody', 'tfoot'])

const rowsOf = (table: Element): Element[] =>
  childElements(table).flatMap((child) => {
    if (child.tagName === 'tr') return [child]
    if (ROW_GROUPS.has(child.tagName))
      return childElements(child).filter((el) => el.tagName === 'tr')
    return []
  })

const cellsOf = (row: Element): Element[] =>
  childElements(row).filter((el) => el.tagName === 'td' || el.tagName === 'th')

const readCell = (cell: Element): TableCell => {
  const text = plainText(cell)
  const only = childElements(cell)
  const lone = only.length === 1 && plainText(only[0]) === text ? only[0] : undefined
  const machine =
    lone?.tagName === 'time'
      ? prop(lone, 'dateTime')
      : lone?.tagName === 'data'
        ? prop(lone, 'value')
        : undefined
  return { text, value: machine?.trim() || text }
}

/** A row's cells, a spanning cell repeated as blanks so columns stay aligned. */
const readRow = (row: Element): TableCell[] =>
  cellsOf(row).flatMap((cell) => {
    const span = Math.max(1, Math.min(50, Number(prop(cell, 'colSpan') ?? 1) || 1))
    const read = readCell(cell)
    return [read, ...Array.from({ length: span - 1 }, () => ({ text: '', value: '' }))]
  })

const isHeaderRow = (row: Element): boolean => {
  const cells = cellsOf(row)
  return cells.length > 0 && cells.every((cell) => cell.tagName === 'th')
}

export const readTable = (table: Element): TableReading => {
  const rows = rowsOf(table)
  const head = childElements(table).find((el) => el.tagName === 'thead')
  const headRows = head ? childElements(head).filter((el) => el.tagName === 'tr') : []
  const header = headRows.at(-1) ?? (rows[0] && isHeaderRow(rows[0]) ? rows[0] : undefined)
  const body = rows
    .filter((row) => row !== header && !headRows.includes(row))
    .map(readRow)
    .filter((cells) => cells.some((cell) => cell.text !== '' || cell.value !== ''))
  const headerCells = header ? readRow(header).map((cell) => cell.text) : []
  const width = Math.max(headerCells.length, ...body.map((cells) => cells.length), 0)
  const columns = Array.from({ length: width }, (_, i) => headerCells[i] || `column ${i + 1}`)
  const caption = childElements(table).find((el) => el.tagName === 'caption')
  const captionText = caption ? plainText(caption) : ''
  return {
    columns,
    rows: body.map((cells) => columns.map((_, i) => cells[i] ?? { text: '', value: '' })),
    ...(captionText ? { caption: captionText } : {}),
  }
}

export interface TableDecision {
  became: 'database' | 'table'
  because: TableReason
  unsure: boolean
}

const hasDateColumn = (reading: TableReading): boolean =>
  reading.columns.some(
    (_, i) => inferColumnType(reading.rows.map((row) => row[i].value)) === 'date'
  )

/**
 * Database or table block. A table a chart reads is a database whatever its size,
 * because a chart can only read records. Within two rows of the line, or a date
 * table of one or two rows, the choice is marked unsure.
 */
export const decideTable = (reading: TableReading, drawn: boolean): TableDecision => {
  const rows = reading.rows.length
  if (drawn) return { became: 'database', because: 'chart', unsure: false }
  if (hasDateColumn(reading)) return { became: 'database', because: 'dates', unsure: rows <= 2 }
  const unsure = Math.abs(rows - (DATABASE_ABOVE_ROWS + 0.5)) <= BORDERLINE_ROWS
  if (rows > DATABASE_ABOVE_ROWS) return { became: 'database', because: 'rows', unsure }
  return { became: 'table', because: 'short', unsure }
}

export const toTableBlock = (
  reading: TableReading,
  id: string,
  mintId: () => string
): TableBlock => ({
  id,
  type: 'table',
  ...(reading.caption ? { title: reading.caption } : {}),
  columns: reading.columns,
  rows: reading.rows.map((cells) => ({ id: mintId(), cells: cells.map((cell) => cell.text) })),
})

/** The schema and records a table becomes. Each record is titled by its first cell. */
export const toDatabase = (
  reading: TableReading,
  mintId: () => string
): { schema: PropertySchema; records: RowPageInput[] } => {
  const rows: TableRow[] = reading.rows.map((cells, i) => ({
    id: String(i),
    cells: cells.map((cell) => cell.value),
  }))
  const schema = inferSchema(reading.columns, rows, mintId)
  return { schema, records: tableRowsToPageInputs(schema, rows) }
}
