'use client'

import type { ModuleViewProps } from '../types'
import type { TableBlock, TableRow } from './schema'
import { sumColumn as sumTableColumn } from './sum'

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

  // Sum footer (ticket-31). Only when `sumColumn` points at a real column AND at
  // least one cell parsed to a number — an all-junk column shows no footer rather
  // than a misleading "0". Recomputed every render so an inline cell edit re-totals
  // live (the whole block re-renders through onChange).
  const sumIndex = data.sumColumn
  const footer =
    sumIndex !== undefined && sumIndex < columns.length ? sumTableColumn(rows, sumIndex) : null
  const showFooter = footer !== null && footer.counted > 0
  const totalDisplay = showFooter ? formatTotal(footer.total, rows, sumIndex!) : null

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
    onChange?.({
      ...data,
      rows: [...rows, { id: crypto.randomUUID(), cells: columns.map(() => '') }],
    })
  }

  function removeRow(rowIndex: number) {
    onChange?.({ ...data, rows: rows.filter((_, i) => i !== rowIndex) })
  }

  return (
    <div className="text-sm text-zinc-800">
      {data.title && <div className="mb-1 text-zinc-500">{data.title}</div>}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                className="border-b border-zinc-200 py-1 pr-3 text-xs font-medium text-zinc-500"
              >
                {col}
              </th>
            ))}
            {editable && <th className="w-6 border-b border-zinc-200" aria-hidden />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !editable && (
            <tr>
              <td colSpan={columns.length} className="py-2 text-zinc-400">
                No entries yet
              </td>
            </tr>
          )}
          {rows.map((row, ri) => (
            <tr key={row.id} className="border-b border-zinc-100 last:border-b-0">
              {columns.map((_, ci) => (
                <td key={ci} className={ci === 0 ? 'py-1 pr-3 font-medium' : 'py-1 pr-3'}>
                  {editable ? (
                    <input
                      className="w-full bg-transparent outline-none"
                      value={row.cells[ci] ?? ''}
                      aria-label={`${columns[ci]}, row ${ri + 1}`}
                      onChange={(e) => patchCell(ri, ci, e.target.value)}
                    />
                  ) : (
                    <span>{row.cells[ci] ?? ''}</span>
                  )}
                </td>
              ))}
              {editable && (
                <td className="w-6 py-1 text-right">
                  <button
                    type="button"
                    aria-label={`Remove row ${ri + 1}`}
                    className="text-zinc-300 hover:text-zinc-600"
                    onClick={() => removeRow(ri)}
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {showFooter && (
          <tfoot>
            <tr className="border-t-2 border-zinc-300">
              {columns.map((_, ci) => {
                if (ci === 0) {
                  return (
                    <td
                      key={ci}
                      className="py-1.5 pr-3 text-[11px] font-medium tracking-[0.08em] text-zinc-400 uppercase"
                    >
                      Total
                    </td>
                  )
                }
                if (ci === sumIndex) {
                  return (
                    <td key={ci} className="py-1.5 pr-3 font-semibold text-zinc-900 tabular-nums">
                      {totalDisplay}
                    </td>
                  )
                }
                return <td key={ci} className="py-1.5 pr-3" aria-hidden />
              })}
              {editable && <td className="w-6" aria-hidden />}
            </tr>
          </tfoot>
        )}
      </table>
      {editable && (
        <button
          type="button"
          className="mt-1 text-xs text-zinc-400 hover:text-zinc-600"
          onClick={addRow}
        >
          + Add row
        </button>
      )}
    </div>
  )
}

/**
 * Format a column total, carrying the column's own currency prefix / percent suffix
 * when the numeric cells consistently use one — so a total of $ prices reads "$1,299"
 * and a % column reads "35%". Falls back to a plain grouped number. Purely cosmetic:
 * the value is already the parser's sum.
 */
function formatTotal(total: number, rows: readonly TableRow[], columnIndex: number): string {
  const cells = rows.map((r) => r.cells[columnIndex] ?? '').filter((c) => /\d/.test(c))
  const grouped = total.toLocaleString(undefined, { maximumFractionDigits: 2 })

  // A leading currency symbol shared by every numeric cell → prefix the total.
  const prefixMatch = cells[0]?.trim().match(/^\s*([$£€¥])/)
  const prefix = prefixMatch?.[1]
  if (prefix && cells.every((c) => c.trim().startsWith(prefix))) return `${prefix}${grouped}`

  // A trailing % on every numeric cell → suffix the total.
  if (cells.length > 0 && cells.every((c) => /%\s*$/.test(c))) return `${grouped}%`

  return grouped
}
