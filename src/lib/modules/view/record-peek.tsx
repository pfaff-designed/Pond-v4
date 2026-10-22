'use client'

/**
 * The record's page. A selected board task, list row, table row, gallery card,
 * or calendar event opens it fixed in the middle of the screen: the title, the
 * fields, and the page body. No scrim, so the view stays live and another
 * record swaps this one.
 *
 * It reads the collection's schema and draws one row per field the schema has — a
 * field the schema lacks is not drawn. Edits are the person's own: they go through
 * the same `onEdit` (`setValue`) a table cell does.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'
import { usePageCanvas } from '../page-canvas'
import { coerceValue, type PropertySchema, type PropertyValue } from '@/lib/properties/schema'
import { Cell, Dash } from './cells'
import { displayValue, type CollectionRow } from './apply'
import { dueAtom } from './due'
import { DueMark } from './due-mark'
import { RecordCheck } from './record-check'
import { DraftInput } from '@/components/atoms/draft-input'
import { RepeatField } from './repeat-field'

const VALUE_INPUT =
  'w-full border-0 bg-transparent p-0 text-[13.5px] text-mn-text outline-none placeholder:text-mn-text-secondary'

const ICON_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-full text-mn-text hover:bg-mn-hover-fill disabled:text-mn-text-secondary'

function PeekIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

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

function PeekField({
  def,
  row,
  schema,
  now,
  editable,
  onEdit,
}: {
  def: PropertySchema[number]
  row: CollectionRow
  schema: PropertySchema
  now: Date
  editable: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  return (
    <div
      data-part="peek-field"
      className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-[10px] rounded-[8px] px-[8px] py-[7px] text-[13.5px]"
    >
      <span className="text-[11px] font-medium text-mn-text-meta">{def.name}</span>
      {editable ? (
        <Cell
          def={def}
          value={coerceValue(def, row.values[def.id])}
          editable
          onChange={(value) => onEdit?.(row.id, def.id, value)}
          schema={schema}
          rowValues={row.values}
          inputClassName={VALUE_INPUT}
        />
      ) : (
        <ReadValue def={def} row={row} schema={schema} now={now} />
      )}
    </div>
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
  onOpenRow,
  placement = 'center',
  onDelete,
  page,
  renderGuests,
  onDismiss,
}: {
  row: CollectionRow
  schema: PropertySchema
  /** The record is done — the head's checkbox draws filled. */
  done: boolean
  /** Ticks or unticks the record; absent leaves the checkbox inert. */
  onToggleDone?: () => void
  now: Date
  editable?: boolean
  /** `side` sits at the right of the canvas. `center` is the page, fixed in
   *  the middle of the screen — a calendar event, and every board task. */
  placement?: 'side' | 'center'
  /** Removes the record. Drawn on the page, centered or beside the view. */
  onDelete?: () => void
  /** Move focus into the peek on mount — set when the card was opened from the keyboard. */
  focusOnOpen?: boolean
  /** Move focus to the title. Only for a record this add just created — a keyboard
   *  select of an existing row keeps focus on that row (KAN-358). */
  focusTitle?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onRenameRow?: (rowId: string, title: string) => void
  /** Present when the host can navigate; absent hides `open ›`. */
  onOpenRow?: (rowId: string) => void
  /** The record's page body. The centered event is that page. */
  page?: ReactNode
  /** The guests field. Absent draws it as plain text. */
  renderGuests?: (field: {
    value: PropertyValue
    editable: boolean
    onChange: (value: PropertyValue) => void
  }) => ReactNode
  /** A press outside the centered page closes it. */
  onDismiss?: () => void
}) {
  const title = row.title || 'Untitled'
  const centered = placement === 'center'
  const fieldsEditable = !!editable
  const isRepeatField = (def: PropertySchema[number]) =>
    (def.type === 'text' || def.type === 'select') && /^repeats?$/i.test(def.name.trim())
  const handleRepeat = (def: PropertySchema[number], phrase: string) => {
    onEdit?.(row.id, def.id, phrase)
  }
  const peekRef = useRef<HTMLElement>(null)
  useDismissOnOutside(
    centered && !!onDismiss,
    () => onDismiss?.(),
    [peekRef],
    (target) => target.closest('[data-row-id], [role="menu"], [role="listbox"]') !== null
  )
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
      data-placement={placement}
      aria-label={`Record: ${title}`}
      tabIndex={-1}
      ref={peekRef}
      style={centered ? undefined : { top: `${top}px` }}
      // The side peek is positioned against the page canvas (it is portaled there):
      // `right 44` is 6u.2's. `top` is 150 below the canvas's visible top at the
      // moment the peek opens. The calendar page is `center`: fixed to the viewport,
      // portaled to `body`, so a scrolled canvas cannot park it on the right.
      className={cn(
        'z-40 flex flex-col gap-[6px] rounded-[20px] bg-mn-card outline-none',
        'shadow-[0_2px_6px_rgba(40,34,24,.08),0_20px_54px_rgba(40,34,24,.18)]',
        'dark:shadow-[0_2px_6px_rgba(0,0,0,.3),0_20px_54px_rgba(0,0,0,.45)]',
        centered
          ? 'fixed top-1/2 left-1/2 h-[min(78vh,48rem)] max-h-[min(88vh,52rem)] w-[min(56rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto px-[28px] pt-[28px] pb-[20px]'
          : 'absolute right-[44px] z-30 w-[330px] px-[12px] pt-[16px] pb-[12px]'
      )}
    >
      <div data-part="peek-head" className="flex items-start gap-[10px] px-[8px] pb-[8px]">
        {!centered && <RecordCheck done={done} label={`${title} done`} onToggle={onToggleDone} />}
        {fieldsEditable && onRenameRow ? (
          <DraftInput
            aria-label="Record title"
            value={row.title}
            placeholder="Untitled"
            onCommit={(next) => onRenameRow(row.id, next)}
            className={cn(
              'min-w-0 flex-1 border-0 bg-transparent p-0 text-mn-text outline-none placeholder:text-mn-text-secondary',
              centered
                ? 'font-serif text-[28px] leading-[1.15] font-extralight'
                : 'text-[16px] leading-[1.3] font-medium'
            )}
          />
        ) : (
          <span
            className={cn(
              'min-w-0 flex-1',
              centered
                ? 'font-serif text-[28px] leading-[1.15] font-extralight'
                : 'text-[16px] leading-[1.3] font-medium'
            )}
          >
            {title}
          </span>
        )}
        {onDelete && (
          <button type="button" aria-label="delete" onClick={onDelete} className={ICON_BUTTON}>
            <PeekIcon>
              <path
                d="M3.5 4.5h9M6.5 4.5V3.5h3v1M5 4.5l.5 8h5l.5-8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </PeekIcon>
          </button>
        )}
        {onOpenRow &&
          (centered ? (
            <button
              type="button"
              aria-label="Open page"
              onClick={() => onOpenRow(row.id)}
              className={ICON_BUTTON}
            >
              <PeekIcon>
                <path
                  d="M9 3h4v4M7 13H3V9M13 3 9 7M3 13l4-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </PeekIcon>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenRow(row.id)}
              className="flex-none text-[11px] font-medium text-mn-text-secondary hover:text-mn-text"
            >
              open ›
            </button>
          ))}
      </div>

      {schema.map((def) => {
        const name = def.name.trim().toLowerCase()
        if (centered && name === 'guests' && renderGuests) {
          return (
            <div
              key={def.id}
              data-part="peek-field"
              className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-[10px] rounded-[8px] px-[8px] py-[7px] text-[13.5px]"
            >
              <span className="text-[11px] font-medium text-mn-text-meta">{def.name}</span>
              {renderGuests({
                value: coerceValue(def, row.values[def.id]),
                editable: fieldsEditable,
                onChange: (value) => onEdit?.(row.id, def.id, value),
              })}
            </div>
          )
        }
        if (centered && isRepeatField(def)) {
          return (
            <div
              key={def.id}
              data-part="peek-field"
              className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-[10px] rounded-[8px] px-[8px] py-[7px] text-[13.5px]"
            >
              <span className="text-[11px] font-medium text-mn-text-meta">{def.name}</span>
              <RepeatField
                value={coerceValue(def, row.values[def.id])}
                editable={fieldsEditable}
                onChange={(phrase) => handleRepeat(def, phrase)}
              />
            </div>
          )
        }
        return (
          <PeekField
            key={def.id}
            def={def}
            row={row}
            schema={schema}
            now={now}
            editable={fieldsEditable}
            onEdit={onEdit}
          />
        )
      })}
      {centered ? page : null}
    </aside>
  )
  if (centered && typeof document !== 'undefined') return createPortal(peek, document.body)
  return canvas?.element ? createPortal(peek, canvas.element) : peek
}
