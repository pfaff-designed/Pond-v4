'use client'

import type { ModuleViewProps } from '../types'
import type { TableBlock, TableRow } from './schema'

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
  function patchRow(rowIndex: number, patch: Partial<TableRow>) {
    onChange?.({
      ...data,
      rows: data.rows.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)),
    })
  }

  function patchCell(rowIndex: number, cellIndex: number, value: string) {
    const row = data.rows[rowIndex]
    patchRow(rowIndex, { cells: row.cells.map((c, i) => (i === cellIndex ? value : c)) })
  }

  function addRow() {
    onChange?.({
      ...data,
      rows: [...data.rows, { id: crypto.randomUUID(), cells: data.columns.map(() => '') }],
    })
  }

  function removeRow(rowIndex: number) {
    onChange?.({ ...data, rows: data.rows.filter((_, i) => i !== rowIndex) })
  }

  return (
    <div className="text-sm text-zinc-800">
      {data.title && <div className="mb-1 text-zinc-500">{data.title}</div>}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {data.columns.map((col, i) => (
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
          {data.rows.length === 0 && !editable && (
            <tr>
              <td colSpan={data.columns.length} className="py-2 text-zinc-400">
                No entries yet
              </td>
            </tr>
          )}
          {data.rows.map((row, ri) => (
            <tr key={row.id} className="border-b border-zinc-100 last:border-b-0">
              {data.columns.map((_, ci) => (
                <td key={ci} className={ci === 0 ? 'py-1 pr-3 font-medium' : 'py-1 pr-3'}>
                  {editable ? (
                    <input
                      className="w-full bg-transparent outline-none"
                      value={row.cells[ci] ?? ''}
                      aria-label={`${data.columns[ci]}, row ${ri + 1}`}
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
