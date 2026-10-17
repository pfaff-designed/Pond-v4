'use client'

import type { ModuleViewProps } from '../types'
import type { TableBlock, TableRow } from './schema'
import { sumColumn as sumTableColumn, formatTotal } from './sum'
import { MarkdownInline } from '@/components/molecules/Markdown'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { useBlockRow } from '../block-row-context'

/**
 * Append one empty row (a blank cell per column) — the table's insert path, pure,
 * so the view's own `+ Add row` and the frame's empty-state action (#239) both go
 * through the one whole-block `onChange` contract.
 */
export function addTableRow(data: TableBlock): TableBlock {
  const columns = data.columns ?? []
  return {
    ...data,
    rows: [...(data.rows ?? []), { id: crypto.randomUUID(), cells: columns.map(() => '') }],
  }
}

/**
 * Table view. An interactive module like todo: editing is folded into the view
 * (inline cell inputs + add/remove row), so `table` declares no separate `editor`.
 * Every interaction emits a whole new block state via `onChange`.
 *
 * Visual language (Mobbin: Framer CMS / Twenty / Xero tables, adapted to Pond's
 * zinc tokens): muted header row, hairline row dividers, no zebra striping, no
 * sort/filter chrome — this is a content block, not a spreadsheet engine.
 */
export function TableView({ data, editable, onChange }: ModuleViewProps<TableBlock>) {
  // Callers can hand this partially-parsed data (streamed tool input) — tolerate
  // missing columns/rows rather than crash the whole tree.
  const columns = data.columns ?? []
  const rows = data.rows ?? []
  const { stepOut } = useBlockRow()

  // Sum footer (ticket-31). Only when `sumColumn` points at a real column AND at
  // least one cell parsed to a number — an all-junk column shows no footer rather
  // than a misleading "0". Recomputed every render so an inline cell edit re-totals
  // live (the whole block re-renders through onChange).
  const footer = computeFooter(data.sumColumn, columns, rows)
  const sumIndex = footer?.index

  function patchRow(rowIndex: number, patch: Partial<TableRow>) {
    onChange?.({
      ...data,
      rows: rows.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)),
    })
  }

  function patchCell(rowIndex: number, cellIndex: number, value: string) {
    const row = rows[rowIndex]
    patchRow(rowIndex, { cells: row.cells.map((c, i) => (i === cellIndex ? value : c)) })
  }

  function addRow() {
    onChange?.(addTableRow(data))
  }

  // Return/↓ in the last row's last cell step out of the table (KAN-344) — every
  // other cell keeps reading those keys itself (multi-line entry, moving down a
  // column), so this only fires at the one cell with nothing left to reach.
  function handleCellKeyDown(ri: number, ci: number, e: React.KeyboardEvent) {
    if (ri !== rows.length - 1 || ci !== columns.length - 1) return
    if (e.key !== 'Enter' && e.key !== 'ArrowDown') return
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    stepOut()
  }

  return (
    <div className="text-sm text-mn-text">
      {/* On a page the block's `title` is the card's eyebrow (PondBlock, #237), so
          under a frame (`[data-block-kind]`) the caption hides rather than reading twice.
          Bare hosts — diff cards, proposal previews, the card preview — keep it. */}
      {data.title && (
        <div className="mb-1 text-mn-text-secondary [[data-block-kind]_&]:hidden">{data.title}</div>
      )}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={`${pageEyebrowClass} border-b border-mn-line py-1 pr-3`}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* No empty row of its own: on a page the frame owns the empty state
              (PondBlock state="empty", #239); bare hosts show the headers alone. */}
          {rows.map((row, ri) => (
            <tr key={row.id} className="border-b border-mn-hair last:border-b-0">
              {columns.map((_, ci) => (
                <td key={ci} className={ci === 0 ? 'py-1 pr-3 font-medium' : 'py-1 pr-3'}>
                  {editable ? (
                    // Editing: raw string — markdown characters must remain editable as-is.
                    <input
                      className="w-full bg-transparent outline-none"
                      value={row.cells[ci] ?? ''}
                      aria-label={`${columns[ci]}, row ${ri + 1}`}
                      onChange={(e) => patchCell(ri, ci, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(ri, ci, e)}
                    />
                  ) : (
                    // Read-only: inline markdown rendering (Fix-4 / F8) — bold/italic/code/links
                    // without block elements. A `**Project A**` cell shows bold, not raw asterisks.
                    <MarkdownInline>{row.cells[ci] ?? ''}</MarkdownInline>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t border-mn-line">
              {columns.map((_, ci) => {
                if (ci === 0) {
                  return (
                    <td key={ci} className={`${pageEyebrowClass} py-1.5 pr-3`}>
                      Total
                    </td>
                  )
                }
                if (ci === sumIndex) {
                  return (
                    <td key={ci} className="py-1.5 pr-3 font-semibold text-mn-text tabular-nums">
                      {footer.display}
                    </td>
                  )
                }
                return <td key={ci} className="py-1.5 pr-3" aria-hidden />
              })}
            </tr>
          </tfoot>
        )}
      </table>
      {editable && (
        <button
          type="button"
          className="mt-1 text-xs text-mn-text-secondary hover:text-mn-text"
          onClick={addRow}
        >
          + Add row
        </button>
      )}
    </div>
  )
}

/**
 * Resolve the sum footer, or null when there is nothing honest to show: no
 * `sumColumn`, an out-of-range index, or a column where no cell parsed to a number
 * (an all-junk column must not show a misleading "0"). Formatting — including the
 * currency/% affordance carried from the cells — lives in `sum.ts` with the parser.
 */
function computeFooter(
  sumColumn: number | undefined,
  columns: readonly string[],
  rows: readonly TableRow[]
): { index: number; display: string } | null {
  if (sumColumn === undefined || sumColumn >= columns.length) return null
  const { total, counted } = sumTableColumn(rows, sumColumn)
  if (counted === 0) return null
  return { index: sumColumn, display: formatTotal(total, rows, sumColumn) }
}
