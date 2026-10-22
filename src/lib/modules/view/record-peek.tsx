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

import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePageCanvas } from '../page-canvas'
import { coerceValue, type PropertySchema, type PropertyValue } from '@/lib/properties/schema'
import { Cell, Dash } from './cells'
import { displayValue, type CollectionRow } from './apply'
import { dueAtom } from './due'
import { DueMark } from './due-mark'
import { RecordCheck } from './record-check'
import { DraftInput } from '@/components/atoms/draft-input'

const VALUE_INPUT =
  'w-full border-0 bg-transparent p-0 text-[13.5px] text-mn-text outline-none placeholder:text-mn-text-secondary'

/** A read-only value: a date as the due text (never the pill — the view owns that), the rest resolved. */
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
    return atom ? <DueMark due={atom} orange={false} part="peek-due" /> : <Dash />
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
  onToggleDone,
  now,
  editable,
  focusOnOpen,
  focusTitle,
  onEdit,
  onRenameRow,
  onDeleteRow,
  onOpenRow,
}: {
  row: CollectionRow
  schema: PropertySchema
  /** The record is done — the head's checkbox draws filled. */
  done: boolean
  /** Ticks or unticks the record; absent leaves the checkbox inert. */
  onToggleDone?: () => void
  now: Date
  editable?: boolean
  /** Move focus into the peek on mount — set when the card was opened from the keyboard. */
  focusOnOpen?: boolean
  /** Move focus to the title. Only for a record this add just created — a keyboard
   *  select of an existing row keeps focus on that row (KAN-358). */
  focusTitle?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onRenameRow?: (rowId: string, title: string) => void
  /** Delete the record (#517 — a board drew no way to remove a task). Present
   *  only when `editable`; absent hides `delete`. */
  onDeleteRow?: (rowId: string) => void
  /** Present when the host can navigate; absent hides `open ›`. */
  onOpenRow?: (rowId: string) => void
}) {
  const title = row.title || 'Untitled'
  const peekRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focusTitle) {
      peekRef.current?.querySelector<HTMLInputElement>('input[aria-label="Record title"]')?.focus()
      return
    }
    if (focusOnOpen) peekRef.current?.focus()
  }, [focusOnOpen, focusTitle])
  const canvas = usePageCanvas()
  // Read once per mount / row change, not on every render: a later scroll moves this
  // element along with the rest of the canvas's content natively, so re-reading
  // scrollTop on an unrelated render would double-count that movement.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- row.id isn't read in the body, but a swap to a new row (same canvas) must re-read scrollTop too
  const top = useMemo(() => (canvas?.element?.scrollTop ?? 0) + 150, [canvas?.element, row.id])
  const peek = (
    <aside
      data-part="record-peek"
      aria-label={`Record: ${title}`}
      tabIndex={-1}
      ref={peekRef}
      style={{ top: `${top}px` }}
      // Positioned against the page canvas (it is portaled there): `right 44` is 6u.2's.
      // `top` is 150 below the canvas's visible top at the moment the peek opens (its
      // scroll container's scrollTop + 150, read on mount and on `row.id` change) rather
      // than 150 from the top of the scrolled content — then it scrolls with the page,
      // same as before, because it is ordinary absolutely-positioned content inside the
      // scrolling canvas. Off a canvas (no `usePageCanvas`, Storybook) top stays 150.
      className={[
        'absolute right-[44px] z-30 flex w-[330px] flex-col gap-[6px] rounded-[20px] bg-mn-card px-[12px] pt-[16px] pb-[12px] outline-none',
        'shadow-[0_2px_6px_rgba(40,34,24,.08),0_20px_54px_rgba(40,34,24,.18)]',
        'dark:shadow-[0_2px_6px_rgba(0,0,0,.3),0_20px_54px_rgba(0,0,0,.45)]',
      ].join(' ')}
    >
      <div data-part="peek-head" className="flex items-start gap-[10px] px-[8px] pb-[8px]">
        <RecordCheck done={done} label={`${title} done`} onToggle={onToggleDone} />
        {editable && onRenameRow ? (
          <DraftInput
            aria-label="Record title"
            value={row.title}
            placeholder="Untitled"
            onCommit={(title) => onRenameRow(row.id, title)}
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
        {editable && onDeleteRow && (
          <button
            type="button"
            onClick={() => onDeleteRow(row.id)}
            aria-label={`Delete ${title}`}
            className="flex-none text-[11px] font-medium text-mn-text-secondary hover:text-mn-text"
          >
            delete
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
  return canvas?.element ? createPortal(peek, canvas.element) : peek
}
