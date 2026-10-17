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

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { PondAtom } from '@/components/atoms/PondAtom'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'
import { AddRowInput } from './add-row-input'
import {
  buildMonthGrid,
  dayItems,
  goToday,
  monthAbbr,
  stepMonth,
  weekdayIndex,
  type MonthDayCell,
} from './calendar-month'
import { pickDateDef, type CollectionRow } from './apply'
import { localDateIso } from './due'
import { CALENDAR_EMPTY_LINE } from './kinds'
import { RecordPeek } from './record-peek'
import { useDoneToggle } from './use-done-toggle'
import { useRecordSelection } from './use-record-selection'

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

function MonthDayNumber({ day, isToday, inMonth }: { day: number; isToday: boolean; inMonth: boolean }) {
  if (isToday) {
    return <PondAtom kind="date" due="today" value={String(day)} className={DAY_NUMBER} />
  }
  return (
    <span className={cn(DAY_NUMBER, inMonth ? 'text-mn-text' : 'text-mn-text-secondary')}>{day}</span>
  )
}

function MonthDayStack({
  items,
  moreCount,
  selectedId,
  rowProps,
  keyboardProps,
  selectWithPointer,
  select,
  onOpenRow,
}: {
  items: MonthDayCell['items']
  moreCount: number
  selectedId?: string
  rowProps: RowSelection['rowProps']
  keyboardProps: RowSelection['keyboardProps']
  selectWithPointer: RowSelection['selectWithPointer']
  select: RowSelection['select']
  onOpenRow?: (rowId: string) => void
}) {
  if (items.length === 0 && moreCount === 0) return null
  // ↵ on the item's own tab stop (not an inner control's) selects it; ↵ again, or a
  // second click, on the already-selected item opens its page — same split as
  // `CollectionTable`'s `handleRowKeyDown`, but the calendar's own click also opens
  // (Jira: "Enter or a second click opens the record").
  function handleItemKeyDown(rowId: string, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Stop the day cell's own Enter/Space listener underneath (open-add-input)
    // from also firing — the same guard the item's click already makes.
    e.stopPropagation()
    if (e.key === 'Enter' && rowId === selectedId) {
      e.preventDefault()
      onOpenRow?.(rowId)
      return
    }
    e.preventDefault()
    select({ id: rowId, via: 'keyboard' })
  }
  return (
    <div className="flex flex-col gap-px px-1 pt-0.5 pb-2">
      {items.map((row) => (
        // A row is its own target — it must never fall through to the cell's
        // "open the add input" click underneath it, so it stops that click too.
        <div
          key={row.id}
          className={cn(DAY_ITEM_ROW, row.id === selectedId && DAY_ITEM_SELECTED_RING)}
          {...rowProps(row.id)}
          {...keyboardProps(row.id)}
          onKeyDown={(e) => handleItemKeyDown(row.id, e)}
          onClick={(e) => {
            e.stopPropagation()
            if (row.id === selectedId) {
              onOpenRow?.(row.id)
              return
            }
            selectWithPointer(row.id)
          }}
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
  isAdding,
  onOpenAdd,
  onCommitAdd,
  onCancelAdd,
  selectedId,
  rowProps,
  keyboardProps,
  selectWithPointer,
  select,
  onOpenRow,
}: {
  cell: MonthDayCell
  columnIndex: number
  canAdd: boolean
  isAdding: boolean
  onOpenAdd: () => void
  onCommitAdd: (title: string) => void
  onCancelAdd: () => void
  selectedId?: string
  rowProps: RowSelection['rowProps']
  keyboardProps: RowSelection['keyboardProps']
  selectWithPointer: RowSelection['selectWithPointer']
  select: RowSelection['select']
  onOpenRow?: (rowId: string) => void
}) {
  const openable = canAdd && !isAdding
  return (
    <div
      data-part="calendar-day-cell"
      data-iso={cell.iso}
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      aria-label={openable ? `Add on ${cell.dayOfMonth} ${monthAbbr(cell.iso)}` : undefined}
      onClick={openable ? onOpenAdd : undefined}
      onKeyDown={
        openable
          ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onOpenAdd()
            }
          : undefined
      }
      className={cn(
        'min-h-[108px] p-1.5',
        columnIndex !== 0 && 'border-l border-mn-text/[0.09] dark:border-mn-text/[0.14]',
        columnIndex >= 5 && 'bg-mn-text/[0.025]'
      )}
    >
      <MonthDayNumber day={cell.dayOfMonth} isToday={cell.isToday} inMonth={cell.inMonth} />
      <MonthDayStack
        items={cell.items}
        moreCount={cell.moreCount}
        selectedId={selectedId}
        rowProps={rowProps}
        keyboardProps={keyboardProps}
        selectWithPointer={selectWithPointer}
        select={select}
        onOpenRow={onOpenRow}
      />
      {isAdding && (
        <AddRowInput
          aria-label={`Add an item on ${cell.dayOfMonth} ${monthAbbr(cell.iso)}`}
          placeholder="Untitled"
          autoFocus
          staysOpen={false}
          onCommit={onCommitAdd}
          onCancel={onCancelAdd}
          className="w-full border-0 bg-transparent px-1 py-0.5 text-[11.5px] text-mn-text outline-none placeholder:text-mn-text-secondary"
        />
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
}: {
  dayOfMonth: number
  isToday: boolean
  label: string
  items: CollectionRow[]
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
            <div key={row.id} className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-[10px] px-2">
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
}) {
  const dateDef = useMemo(() => pickDateDef(schema, groupBy), [schema, groupBy])
  // `today` is read once per mount, as the board reads its own `now` (view.tsx);
  // the local calendar date, matching `due.ts`'s `dueAtom`, not UTC's.
  const [todayIso] = useState(() => localDateIso(new Date()))
  const [now] = useState(() => new Date())
  const [focusIso, setFocusIso] = useState(todayIso)
  const [addingIso, setAddingIso] = useState<string | null>(null)
  const grid = useMemo(
    () => buildMonthGrid(focusIso, todayIso, rows, dateDef),
    [dateDef, focusIso, todayIso, rows]
  )
  const { selectedRow, rowProps, keyboardProps, selectWithPointer, select } = useRecordSelection(
    rows,
    viewKey ?? 'calendar'
  )
  const done = useDoneToggle({ schema, editable, onEdit })

  const canAdd = !!dateDef && !!editable && !!onAddRow

  // The date rides in `addRow`'s own values rather than a follow-up `setValue` —
  // one write, same one-change-log-record pause as `CollectionList`'s add
  // (session undo for row adds is KAN-419).
  const handleAddDay = async (iso: string, title: string) => {
    if (!dateDef) return
    try {
      const id = await onAddRow?.({ [dateDef.id]: iso })
      if (id) onRenameRow?.(id, title)
    } catch (err) {
      console.error('Failed to add a day', err)
    }
  }

  const focusIsToday = focusIso === todayIso
  const focusDayOfMonth = Number(focusIso.slice(8, 10))
  const focusLabel = `${DOW_LABELS[weekdayIndex(focusIso)]} ${monthAbbr(focusIso)}${focusIsToday ? ' · today' : ''}`
  const focusItems = dayItems(rows, dateDef, focusIso)

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
      ) : (
        rows.length === 0 && (
          <span className="px-0.5 text-[13px] text-mn-text-secondary">{CALENDAR_EMPTY_LINE}</span>
        )
      )}
      <div className="hidden md:flex md:flex-col">
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
                isAdding={addingIso === cell.iso}
                onOpenAdd={() => setAddingIso(cell.iso)}
                onCommitAdd={(title) => void handleAddDay(cell.iso, title)}
                onCancelAdd={() => setAddingIso(null)}
                selectedId={selectedRow?.id}
                rowProps={rowProps}
                keyboardProps={keyboardProps}
                selectWithPointer={selectWithPointer}
                select={select}
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
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}
    </div>
  )
}
