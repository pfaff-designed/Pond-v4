'use client'

/**
 * Calendar view — the month span (#262 1/3), from `PondCalendar.dc.html`. Chrome is
 * the period label, prev/next stepping and a `today` button; the grid itself (desktop
 * weeks, mobile dots plus the tapped day's own list, the DC's `showList` for
 * `mob && span === 'month'`) is built in the sibling items of this ticket. The DC's
 * `isMonthD`/`isMonthM` don't depend on `isEmpty` (`empty` only zeroes `recs`), so
 * chrome and grid stay drawn under either empty case. No date property on the
 * collection (KAN-292) → `CALENDAR_EMPTY_LINE` draws in `PondBlockEmpty`'s emptyBox
 * with the `add a date field` remedy, but only when `onAddDateField` is wired — a
 * read-only render (no handler, same as a date property with zero rows) keeps the
 * board's bare `emptyLine` span instead; there is no button to offer.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { PondAtom } from '@/components/atoms/PondAtom'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'
import {
  buildMonthGrid,
  dateForDrop,
  dayItems,
  goToday,
  monthAbbr,
  rowDateIso,
  stepMonth,
  weekdayIndex,
  type MonthDayCell,
} from './calendar-month'
import { pickDateDef, type CollectionRow } from './apply'
import { localDateIso } from './due'
import { CALENDAR_EMPTY_LINE } from './kinds'
import { RecordPeek } from './record-peek'
import { UndatedRecords } from './undated-records'
import { useDoneToggle } from './use-done-toggle'
import {
  DRAG_LIFT_CLASS,
  DRAG_OVER_CLASS,
  usePointerBucketDrag,
  type PointerBucketDrag,
} from './use-pointer-bucket-drag'
import { ROW_FOCUS_VISIBLE, useRecordSelection } from './use-record-selection'

/** The shape `useRecordSelection` hands back for a row-typed-id container (the
 *  stack item, the focus-list row) — read off the hook's own return so this file
 *  never redeclares its props. */
type RowSelection = ReturnType<typeof useRecordSelection<CollectionRow>>

const NAV_BTN = 'inline-flex size-11 items-center justify-center rounded-mn-pill text-mn-text hover:bg-mn-hover-fill md:size-7'

/** `DW` — the DC's lowercase weekday short-forms; `textTransform: uppercase` draws them caps. */
const DOW_LABELS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DOW_HEAD = 'px-2 pb-1.5 text-left text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
/** The DC's mobile `dows` style: centered, `padding: '0 0 4px'` instead of the desktop row's side padding. */
const DOW_HEAD_MOBILE = 'pb-1 text-center text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
/** The DC's `todayNum(t,22,12,inM)`: today gets the one burnt-orange chip per screen. */
const DAY_NUMBER =
  'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12px] font-medium tabular-nums'
/** The DC's stack item row: `gap 6 · height 20 · padding 0 4 · radius 6`. */
const DAY_ITEM_ROW = 'flex h-5 items-center gap-1.5 rounded-[6px] px-1'
/** `PondCalendar.dc.html`'s `ring(o)`: a selected item's own 1.5px inset ink ring. */
const DAY_ITEM_SELECTED_RING = 'ring-[1.5px] ring-inset ring-mn-text'
/** `boxSt(o,9)`: a 9px dot, `boxShadow: inset 0 0 0 1.4px a(.32)` for a live (non-done) row. */
const DAY_ITEM_DOT = 'size-[9px] flex-none rounded-[2.5px] box-border ring-[1.4px] ring-inset ring-mn-text/[0.32]'
/** `tSt(o,11.5)`: flex-1, one line, ellipsis. */
const DAY_ITEM_TITLE = 'min-w-0 flex-1 truncate text-[11.5px] leading-[1.3] text-mn-text'
/** `moreLabel` / `moreStyle`: `＋{n} more`, 10.5px ink/.68. */
const DAY_MORE = 'px-1 py-px text-[10.5px] font-medium text-mn-text-secondary'
/** `todayNum(t,28,13,inM)`: the mobile dot grid's own, larger day-number chip. */
const DAY_NUMBER_MOBILE =
  'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[13px] font-medium tabular-nums'
/** `isF` — the DC's focus ring (`inset 0 0 0 1.4px fg`) on the picked, not-today day. */
const DAY_NUMBER_FOCUS_RING = 'ring-[1.4px] ring-inset ring-mn-text'
/** `dotSt(o)`: a solid 4px dot per dated row, `height: 4` dot row, up to 3. */
const DAY_DOT_ROW = 'flex h-1 items-center gap-[3px]'
const DAY_DOT = 'size-1 flex-none rounded-full bg-mn-text'
/** The focused-day list's own head chip: `todayNum(t,30,20)`, `alignSelf: 'flex-start'`. */
const DAY_NUMBER_LIST = 'inline-flex h-[30px] min-w-[30px] self-start text-[20px] font-medium tabular-nums'
/** `boxSt(o,13)`: the focused-day list's larger dot, `radius 4` (`sz > 11`). */
const DAY_ITEM_DOT_LARGE = 'size-[13px] flex-none rounded-[4px] box-border ring-[1.4px] ring-inset ring-mn-text/[0.32]'
/** The day cell's add mark. Hidden until that cell is hovered or focus-within.
 *  Named `group/day`, not a bare `group`: BlockCanvas's block wrapper is already
 *  `group`, and a bare one would reveal every day's plus as soon as the pointer
 *  entered the block. */
const DAY_ADD_BUTTON =
  'absolute right-1 top-1 text-mn-text-secondary opacity-0 group-hover/day:opacity-100 group-focus-within/day:opacity-100'
/** Armed placement (KAN-454): the same hover fill as the month nav, so a day reads as a target. */
const DAY_PLACE_HOVER = 'cursor-pointer hover:bg-mn-hover-fill'
const UNDATED_LINE = 'px-0.5 text-left text-[13px] font-mono lowercase text-mn-text-secondary'

function MonthDayNumber({ day, isToday, inMonth }: { day: number; isToday: boolean; inMonth: boolean }) {
  if (isToday) {
    return <PondAtom kind="date" due="today" value={String(day)} className={DAY_NUMBER} />
  }
  return (
    <span className={cn(DAY_NUMBER, inMonth ? 'text-mn-text' : 'text-mn-text-secondary')}>{day}</span>
  )
}

function handleCalendarRowClick(
  rowId: string,
  selectedId: string | undefined,
  selectWithPointer: RowSelection['selectWithPointer'],
  onOpenRow: ((rowId: string) => void) | undefined,
  isClickSuppressed: PointerBucketDrag['isClickSuppressed'],
  e: React.MouseEvent<HTMLDivElement>
) {
  // A drag's trailing click lands here too (its row is the click's target) —
  // it must never open or select, same as `selectWithPointer`'s own guard below.
  if (isClickSuppressed()) return
  // A row is its own target. Stopping the click keeps it off the block row
  // underneath, which focuses itself on a click that is not an inner control.
  e.stopPropagation()
  if (rowId === selectedId) {
    onOpenRow?.(rowId)
    return
  }
  selectWithPointer(rowId)
}

function MonthDayStack({
  items,
  moreCount,
  selectedId,
  draggingRowId,
  editable,
  onCardPointerDown,
  isClickSuppressed,
  rowProps,
  keyboardProps,
  selectWithPointer,
  selectOrOpenOnKey,
  onOpenRow,
}: {
  items: MonthDayCell['items']
  moreCount: number
  selectedId?: string
  draggingRowId?: string
  editable?: boolean
  onCardPointerDown: PointerBucketDrag['onCardPointerDown']
  isClickSuppressed: PointerBucketDrag['isClickSuppressed']
  rowProps: RowSelection['rowProps']
  keyboardProps: RowSelection['keyboardProps']
  selectWithPointer: RowSelection['selectWithPointer']
  selectOrOpenOnKey: RowSelection['selectOrOpenOnKey']
  onOpenRow?: (rowId: string) => void
}) {
  if (items.length === 0 && moreCount === 0) return null
  return (
    <div className="flex flex-col gap-px px-1 pt-0.5 pb-2">
      {items.map((row) => (
        <div
          key={row.id}
          className={cn(
            DAY_ITEM_ROW,
            ROW_FOCUS_VISIBLE,
            row.id === selectedId && DAY_ITEM_SELECTED_RING,
            row.id === draggingRowId && DRAG_LIFT_CLASS
          )}
          {...rowProps(row.id)}
          {...keyboardProps(row.id)}
          onKeyDown={(e) => selectOrOpenOnKey(row.id, e, onOpenRow)}
          onClick={(e) =>
            handleCalendarRowClick(row.id, selectedId, selectWithPointer, onOpenRow, isClickSuppressed, e)
          }
          onPointerDown={editable ? (e) => onCardPointerDown(e, row.id) : undefined}
        >
          <span className={DAY_ITEM_DOT} />
          <span className={DAY_ITEM_TITLE}>{row.title}</span>
        </div>
      ))}
      {moreCount > 0 && <span className={DAY_MORE}>{`＋${moreCount} more`}</span>}
    </div>
  )
}

function MonthDayCellView({
  cell,
  columnIndex,
  canAdd,
  onAdd,
  selectedId,
  draggingRowId,
  isOver,
  armed,
  editable,
  registerBucket,
  onCardPointerDown,
  isClickSuppressed,
  rowProps,
  keyboardProps,
  selectWithPointer,
  selectOrOpenOnKey,
  onOpenRow,
}: {
  cell: MonthDayCell
  columnIndex: number
  canAdd: boolean
  onAdd: () => void
  selectedId?: string
  draggingRowId?: string
  isOver: boolean
  /** While a record is armed, the cell takes the month-nav hover fill. */
  armed: boolean
  editable?: boolean
  registerBucket: PointerBucketDrag['registerBucket']
  onCardPointerDown: PointerBucketDrag['onCardPointerDown']
  isClickSuppressed: PointerBucketDrag['isClickSuppressed']
  rowProps: RowSelection['rowProps']
  keyboardProps: RowSelection['keyboardProps']
  selectWithPointer: RowSelection['selectWithPointer']
  selectOrOpenOnKey: RowSelection['selectOrOpenOnKey']
  onOpenRow?: (rowId: string) => void
}) {
  // A stack item's Enter bubbles. Only the cell itself adds; the item's own
  // Enter still selects (KAN-358). The cell has no click handler: blank space
  // and a drag's trailing click add nothing.
  const handleCellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.target !== event.currentTarget) return
    event.preventDefault()
    onAdd()
  }
  const handlePlusClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onAdd()
  }
  return (
    <div
      data-part="calendar-day-cell"
      data-iso={cell.iso}
      ref={registerBucket(cell.iso)}
      onKeyDown={canAdd ? handleCellKeyDown : undefined}
      tabIndex={canAdd ? 0 : undefined}
      className={cn(
        'group/day relative min-h-[108px] p-1.5 transition-colors duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none',
        columnIndex !== 0 && 'border-l border-mn-text/[0.09] dark:border-mn-text/[0.14]',
        isOver ? DRAG_OVER_CLASS : columnIndex >= 5 ? 'bg-mn-text/[0.025]' : '',
        armed && DAY_PLACE_HOVER
      )}
    >
      <MonthDayNumber day={cell.dayOfMonth} isToday={cell.isToday} inMonth={cell.inMonth} />
      <MonthDayStack
        items={cell.items}
        moreCount={cell.moreCount}
        selectedId={selectedId}
        draggingRowId={draggingRowId}
        editable={editable}
        onCardPointerDown={onCardPointerDown}
        isClickSuppressed={isClickSuppressed}
        rowProps={rowProps}
        keyboardProps={keyboardProps}
        selectWithPointer={selectWithPointer}
        selectOrOpenOnKey={selectOrOpenOnKey}
        onOpenRow={onOpenRow}
      />
      {canAdd && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Add on ${cell.dayOfMonth} ${monthAbbr(cell.iso)}`}
          onClick={handlePlusClick}
          className={DAY_ADD_BUTTON}
        >
          <DayPlus />
        </button>
      )}
    </div>
  )
}

function MonthDotCellView({
  cell,
  isFocus,
  onSelect,
}: {
  cell: MonthDayCell
  isFocus: boolean
  onSelect: (iso: string) => void
}) {
  return (
    <button
      type="button"
      aria-label={`${cell.dayOfMonth} ${monthAbbr(cell.iso)}`}
      onClick={() => onSelect(cell.iso)}
      className="flex h-12 flex-col items-center justify-center gap-1"
    >
      {cell.isToday ? (
        <PondAtom kind="date" due="today" value={String(cell.dayOfMonth)} className={DAY_NUMBER_MOBILE} />
      ) : (
        <span
          className={cn(
            DAY_NUMBER_MOBILE,
            cell.inMonth ? 'text-mn-text' : 'text-mn-text-secondary',
            isFocus && DAY_NUMBER_FOCUS_RING
          )}
        >
          {cell.dayOfMonth}
        </span>
      )}
      <span className={DAY_DOT_ROW}>
        {cell.items.map((row) => (
          <span key={row.id} className={DAY_DOT} />
        ))}
      </span>
    </button>
  )
}

/** `todayNum(t,30,20)`, with the agDays override: no pill padding/centring unless
 *  `t === today` (a plain left-aligned number otherwise). */
function FocusedDayNumber({ day, isToday }: { day: number; isToday: boolean }) {
  if (isToday) {
    return (
      <PondAtom
        kind="date"
        due="today"
        value={String(day)}
        className={cn(DAY_NUMBER_LIST, 'items-center justify-center rounded-full px-1')}
      />
    )
  }
  return (
    <span className={cn(DAY_NUMBER_LIST, 'items-center justify-start px-0 text-mn-text')}>{day}</span>
  )
}

/** The mobile month's `showList` row (DC: `mob && span === 'month'`, `listDays = [focus]`):
 *  the tapped day's full, uncapped list under the dot grid. */
function FocusDayList({
  dayOfMonth,
  isToday,
  label,
  items,
  selectedId,
  isClickSuppressed,
  rowProps,
  keyboardProps,
  selectWithPointer,
  selectOrOpenOnKey,
  onOpenRow,
}: {
  dayOfMonth: number
  isToday: boolean
  label: string
  items: CollectionRow[]
  selectedId?: string
  isClickSuppressed: PointerBucketDrag['isClickSuppressed']
  rowProps: RowSelection['rowProps']
  keyboardProps: RowSelection['keyboardProps']
  selectWithPointer: RowSelection['selectWithPointer']
  selectOrOpenOnKey: RowSelection['selectOrOpenOnKey']
  onOpenRow?: (rowId: string) => void
}) {
  return (
    <div
      data-part="calendar-focus-list"
      className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 border-t border-mn-text/[0.09] py-2.5 dark:border-mn-text/[0.14] md:hidden"
    >
      <div className="flex flex-col gap-0.5 pt-1.5">
        <FocusedDayNumber day={dayOfMonth} isToday={isToday} />
        <span className="text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary">
          {label}
        </span>
      </div>
      <div className="flex flex-col">
        {items.length === 0 ? (
          <span className="py-2.5 text-[13px] text-mn-text-secondary">nothing dated</span>
        ) : (
          items.map((row) => (
            <div
              key={row.id}
              className={cn(
                'flex min-h-11 min-w-0 items-center gap-2.5 rounded-[10px] px-2',
                ROW_FOCUS_VISIBLE,
                row.id === selectedId && DAY_ITEM_SELECTED_RING
              )}
              {...rowProps(row.id)}
              {...keyboardProps(row.id)}
              onKeyDown={(e) => selectOrOpenOnKey(row.id, e, onOpenRow)}
              onClick={(e) =>
                handleCalendarRowClick(row.id, selectedId, selectWithPointer, onOpenRow, isClickSuppressed, e)
              }
            >
              <span className={DAY_ITEM_DOT_LARGE} />
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[1.3] text-mn-text">
                {row.title}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function DayPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M6 2.4v7.2M2.4 6h7.2" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 2.5L4 6l3.5 3.5" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 2.5L8 6 4.5 9.5" />
    </svg>
  )
}

export function CollectionCalendar({
  viewKey,
  schema,
  rows,
  groupBy,
  editable,
  onEdit,
  onAddRow,
  onRenameRow,
  onOpenRow,
  onAddDateField,
  onMoveDate,
}: {
  /** The view block's id — what the page canvas keys its one peek and one orange
   *  pill by. Optional: every existing direct render of this component predates
   *  selection and has no canvas to key against, so it falls back to a constant. */
  viewKey?: string
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
  onAddDateField?: () => void
  onMoveDate?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  const dateDef = useMemo(() => pickDateDef(schema, groupBy), [schema, groupBy])
  // `today` is read once per mount, as the board reads its own `now` (view.tsx);
  // the local calendar date, matching `due.ts`'s `dueAtom`, not UTC's.
  const [todayIso] = useState(() => localDateIso(new Date()))
  const [now] = useState(() => new Date())
  const [focusIso, setFocusIso] = useState(todayIso)
  const grid = useMemo(
    () => buildMonthGrid(focusIso, todayIso, rows, dateDef),
    [dateDef, focusIso, todayIso, rows]
  )

  // Dropping on a day cell writes that day to the date field; a drop back onto the
  // row's own current day is a no-op (no write, no log, no undo step).
  const {
    drag,
    overKey,
    registerBucket,
    onCardPointerDown,
    isClickSuppressed,
    containerHandlers,
    containerClassName,
  } = usePointerBucketDrag({
      editable: !!editable,
      onDrop: (rowId, key) => {
        if (!dateDef || !onMoveDate) return
        const row = rows.find((r) => r.id === rowId)
        if (!row || rowDateIso(row, dateDef) === key) return
        onMoveDate(rowId, dateDef.id, dateForDrop(row.values[dateDef.id], key))
      },
    })

  const { selectedRow, select, rowProps, keyboardProps, selectWithPointer, selectOrOpenOnKey } =
    useRecordSelection(rows, viewKey ?? 'calendar', { isClickSuppressed })
  const done = useDoneToggle({ schema, editable, onEdit })

  const canAdd = !!dateDef && !!editable && !!onAddRow
  // Guards handleAddDay against a second click while its write is in flight
  // (AUDIT G9), same shape as CollectionGallery's handleAddRecord.
  const addingRef = useRef(false)
  // The id this click just added. `focusTitle` is that id only — a keyboard
  // select of an existing stack item must not move focus into the peek (KAN-358).
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null)
  const [undatedOpen, setUndatedOpen] = useState(false)
  const [placement, setPlacement] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    if (!placement) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPlacement(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [placement])

  const handlePickUndated = (row: CollectionRow) => {
    setPlacement({ id: row.id, title: row.title })
    setUndatedOpen(false)
  }

  const handleUndatedLineClick = () => {
    if (placement) return
    setUndatedOpen((open) => !open)
  }

  // The date rides in `addRow`'s own values rather than a follow-up `setValue` —
  // one write, same one-change-log-record pause as `CollectionList`'s add
  // (session undo for row adds is KAN-419).
  const handleAddDay = async (iso: string) => {
    if (!dateDef || !onAddRow || addingRef.current) return
    addingRef.current = true
    try {
      const id = await onAddRow({ [dateDef.id]: iso })
      if (!id) return
      setFocusTitleId(id)
      select({ id, via: 'keyboard' })
    } catch (err) {
      console.error('Failed to add a day', err)
    } finally {
      addingRef.current = false
    }
  }

  const focusIsToday = focusIso === todayIso
  const focusDayOfMonth = Number(focusIso.slice(8, 10))
  const focusLabel = `${DOW_LABELS[weekdayIndex(focusIso)]} ${monthAbbr(focusIso)}${focusIsToday ? ' · today' : ''}`
  const focusItems = dayItems(rows, dateDef, focusIso)
  const undatedRows = dateDef ? rows.filter((row) => rowDateIso(row, dateDef) === null) : []
  const undatedCount = undatedRows.length
  const showUndatedLine = !!dateDef && undatedCount > 0
  const undatedLabel = placement
    ? `pick a day for ${placement.title.toLowerCase()}`
    : `${undatedCount} without a date`

  return (
    <div
      data-part="calendar-card"
      className={cn(
        'flex flex-col gap-3 rounded-[20px] bg-mn-card px-3 pt-[14px] pb-4 md:gap-3.5 md:px-5 md:pt-[18px] md:pb-5',
        'shadow-[0_1px_2px_rgba(40,34,24,.04),0_8px_24px_rgba(40,34,24,.06)]',
        'dark:shadow-[0_1px_2px_rgba(0,0,0,.3),0_8px_24px_rgba(0,0,0,.34)]'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div className="flex w-full items-center justify-between gap-1.5 md:w-auto md:justify-normal">
          <span className="min-w-0 text-base font-medium tabular-nums md:min-w-[150px] md:text-[15px]">
            {grid.periodLabel}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setFocusIso((f) => stepMonth(f, -1))}
              className={NAV_BTN}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setFocusIso((f) => stepMonth(f, 1))}
              className={NAV_BTN}
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-normal">
          <button
            type="button"
            onClick={() => setFocusIso(goToday(todayIso))}
            className="rounded-mn-pill px-3.5 py-3 text-xs font-medium ring-1 ring-inset ring-mn-text/20 md:px-3 md:py-1.5 md:text-[10.5px]"
          >
            today
          </button>
        </div>
      </div>
      {showUndatedLine ? (
        <button
          type="button"
          aria-expanded={placement ? undefined : undatedOpen}
          onClick={handleUndatedLineClick}
          className={UNDATED_LINE}
        >
          {undatedLabel}
        </button>
      ) : null}
      {showUndatedLine && undatedOpen && !placement ? (
        <UndatedRecords
          rows={undatedRows}
          onClose={() => setUndatedOpen(false)}
          onPick={handlePickUndated}
        />
      ) : null}
      {!dateDef ? (
        onAddDateField ? (
          <PondBlockEmpty
            line={CALENDAR_EMPTY_LINE}
            action="add a date field"
            onAction={onAddDateField}
          />
        ) : (
          <span className="px-0.5 text-[13px] text-mn-text-secondary">{CALENDAR_EMPTY_LINE}</span>
        )
      ) : rows.length === 0 ? (
        <span className="px-0.5 text-[13px] text-mn-text-secondary">{CALENDAR_EMPTY_LINE}</span>
      ) : undatedCount === rows.length ? (
        <span className="px-0.5 text-[13px] font-mono lowercase text-mn-text-secondary">
          {undatedCount} records, none with a date
        </span>
      ) : null}
      <div className={cn('hidden md:flex md:flex-col', containerClassName)} {...containerHandlers}>
        <div className="grid grid-cols-7">
          {DOW_LABELS.map((l) => (
            <span key={l} className={DOW_HEAD}>
              {l}
            </span>
          ))}
        </div>
        {grid.weeks.map((week, w) => (
          <div key={w} className="grid grid-cols-7 border-t border-mn-text/[0.09] dark:border-mn-text/[0.14]">
            {week.days.map((cell, i) => (
              <MonthDayCellView
                key={cell.iso}
                cell={cell}
                columnIndex={i}
                canAdd={canAdd}
                onAdd={() => void handleAddDay(cell.iso)}
                selectedId={selectedRow?.id}
                draggingRowId={drag?.active ? drag.rowId : undefined}
                isOver={!!editable && !!drag?.active && overKey === cell.iso}
                armed={placement !== null}
                editable={editable}
                registerBucket={registerBucket}
                onCardPointerDown={onCardPointerDown}
                isClickSuppressed={isClickSuppressed}
                rowProps={rowProps}
                keyboardProps={keyboardProps}
                selectWithPointer={selectWithPointer}
                selectOrOpenOnKey={selectOrOpenOnKey}
                onOpenRow={onOpenRow}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 md:hidden">
        {DOW_LABELS.map((l) => (
          <span key={l} className={DOW_HEAD_MOBILE}>
            {l}
          </span>
        ))}
        {grid.weeks.flatMap((week) =>
          week.days.map((cell) => (
            <MonthDotCellView
              key={cell.iso}
              cell={cell}
              isFocus={cell.iso === focusIso && !cell.isToday}
              onSelect={setFocusIso}
            />
          ))
        )}
      </div>
      <FocusDayList
        dayOfMonth={focusDayOfMonth}
        isToday={focusIsToday}
        label={focusLabel}
        items={focusItems}
        selectedId={selectedRow?.id}
        isClickSuppressed={isClickSuppressed}
        rowProps={rowProps}
        keyboardProps={keyboardProps}
        selectWithPointer={selectWithPointer}
        selectOrOpenOnKey={selectOrOpenOnKey}
        onOpenRow={onOpenRow}
      />
      {selectedRow && (
        <RecordPeek
          key={selectedRow.id}
          row={selectedRow}
          schema={schema}
          done={done.isDone(selectedRow)}
          onToggleDone={done.toggle && (() => done.toggle?.(selectedRow))}
          now={now}
          editable={editable}
          focusTitle={selectedRow.id === focusTitleId}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}
    </div>
  )
}
