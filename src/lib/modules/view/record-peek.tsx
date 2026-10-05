'use client'

/**
 * The task record, peeked beside the view (`Pond 02` 2u `task record`, placed by
 * `Pond 06.21` 6u.2). A selected board card opens its fields in a floating card at
 * the right of the canvas: no scrim and no focus trap, so the lanes stay live and
 * another card simply swaps the record.
 *
 * It reads the collection's schema and draws one row per field the schema has — a
 * field the schema lacks is not drawn. Edits are the person's own: they go through
 * the same `onEdit` (`setValue`) a table cell does.
 */

import { useEffect, useRef } from 'react'
import { coerceValue, type PropertySchema, type PropertyValue } from '@/lib/properties/schema'
import { Cell, Dash } from './cells'
import { displayValue, type CollectionRow } from './apply'
import { dueAtom } from './due'

const VALUE_INPUT =
  'w-full border-0 bg-transparent p-0 text-[13.5px] text-mn-text outline-none placeholder:text-mn-text-secondary'

/** A read-only value: a date as the due atom (plain — only the board's first `today` is orange), the rest resolved. */
function ReadValue({
  def,
  row,
  schema,
  now,
}: {
  def: PropertySchema[number]
  row: CollectionRow
  schema: PropertySchema
  now: Date
}) {
  const value = coerceValue(def, row.values[def.id])
  if (def.type === 'date') {
    const atom = typeof value === 'string' ? dueAtom(value, now) : null
    if (!atom) return <Dash />
    return <span>{atom.kind === 'today' ? 'today' : atom.label}</span>
  }
  if (
    def.type === 'text' ||
    def.type === 'number' ||
    def.type === 'select' ||
    def.type === 'status'
  ) {
    const text = displayValue(def, value)
    return text ? <span>{text}</span> : <Dash />
  }
  return (
    <Cell
      def={def}
      value={value}
      editable={false}
      onChange={() => {}}
      schema={schema}
      rowValues={row.values}
    />
  )
}

export function RecordPeek({
  row,
  schema,
  done,
  now,
  editable,
  focusOnOpen,
  onEdit,
  onRenameRow,
  onOpenRow,
}: {
  row: CollectionRow
  schema: PropertySchema
  /** The record sits in a `done` lane — the head's checkbox draws filled. */
  done: boolean
  now: Date
  editable?: boolean
  /** Move focus into the peek on mount — set when the card was opened from the keyboard. */
  focusOnOpen?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onRenameRow?: (rowId: string, title: string) => void
  /** Present when the host can navigate; absent hides `open ›`. */
  onOpenRow?: (rowId: string) => void
}) {
  const title = row.title || 'Untitled'
  const peekRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focusOnOpen) peekRef.current?.focus()
  }, [focusOnOpen])
  return (
    <aside
      data-part="record-peek"
      aria-label={`Record: ${title}`}
      tabIndex={-1}
      ref={peekRef}
      // The board's float: paper at radius 20, 16/12/12, gap 6, two layers of the
      // peek's own shadow — it matches no token. Fixed to the window so a scrolled
      // page keeps it beside the view; `right 44 / top 150` are 6u.2's.
      className={[
        'fixed top-[150px] right-[44px] z-30 flex w-[330px] flex-col gap-[6px] rounded-[20px] bg-mn-card px-[12px] pt-[16px] pb-[12px] outline-none',
        'shadow-[0_2px_6px_rgba(40,34,24,.08),0_20px_54px_rgba(40,34,24,.18)]',
        'dark:shadow-[0_2px_6px_rgba(0,0,0,.3),0_20px_54px_rgba(0,0,0,.45)]',
      ].join(' ')}
    >
      <div data-part="peek-head" className="flex items-start gap-[10px] px-[8px] pb-[8px]">
        <span
          aria-hidden
          data-done={done || undefined}
          className={[
            'flex size-[15px] flex-none items-center justify-center rounded-[4px]',
            done
              ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
              : 'ring-[1.4px] ring-mn-mark-faint ring-inset',
          ].join(' ')}
        >
          {done && (
            <svg
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5.2 4.2 7.4 8 2.8" />
            </svg>
          )}
        </span>
        {editable && onRenameRow ? (
          <input
            aria-label="Record title"
            value={row.title}
            placeholder="Untitled"
            onChange={(e) => onRenameRow(row.id, e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] leading-[1.3] font-medium text-mn-text outline-none placeholder:text-mn-text-secondary"
          />
        ) : (
          <span className="min-w-0 flex-1 text-[16px] leading-[1.3] font-medium">{title}</span>
        )}
        {onOpenRow && (
          <button
            type="button"
            onClick={() => onOpenRow(row.id)}
            className="flex-none text-[11px] font-medium text-mn-text-secondary hover:text-mn-text"
          >
            open ›
          </button>
        )}
      </div>

      {schema.map((def) => (
        <div
          key={def.id}
          data-part="peek-field"
          className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-[10px] rounded-[8px] px-[8px] py-[7px] text-[13.5px]"
        >
          <span className="text-[11px] font-medium text-mn-text-meta">{def.name}</span>
          {editable ? (
            <Cell
              def={def}
              value={coerceValue(def, row.values[def.id])}
              editable
              onChange={(v) => onEdit?.(row.id, def.id, v)}
              schema={schema}
              rowValues={row.values}
              inputClassName={VALUE_INPUT}
            />
          ) : (
            <ReadValue def={def} row={row} schema={schema} now={now} />
          )}
        </div>
      ))}
    </aside>
  )
}
