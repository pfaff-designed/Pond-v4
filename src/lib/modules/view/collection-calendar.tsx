'use client'

/**
 * Calendar view — the month span (#262 1/3), from `PondCalendar.dc.html`. Chrome is
 * the period label, prev/next stepping, the span pill (month, week, day, and agenda), and a
 * `today` button; the month grid (desktop weeks, mobile dots plus the tapped
 * day's own list, the DC's `showList` for
 * `mob && span === 'month'`) draws while the span is month. A week span unmounts
 * that grid and draws the desktop week body (`PondCalendar.dc.html` `isTime` for
 * `span === 'week'`): seven day heads, the all-day row, then the hour grid.
 * A day span unmounts the month grid and draws the day body — all-day row, then
 * the hour grid — at the desktop metrics and again at the mobile ones
 * (`PondCalendar.dc.html` `isTime`).
 * On a phone the day span draws one Monday-first week strip before both bodies
 * (`PondCalendar.dc.html` lines 185–192).
 * An agenda span unmounts the month grid, both time bodies, the week strip and
 * the focus list, and draws the list (`showList` for `span === 'agenda'`,
 * lines 230–246) from `buildAgenda`.
 * A blank click on a desktop month cell opens that day (`goDay`). A mobile month
 * dot only moves the focus and keeps the month span. The DC's
 * `isMonthD`/`isMonthM` don't depend on `isEmpty` (`empty` only zeroes `recs`), so
 * chrome and grid stay drawn under either empty case. No date property on the
 * collection (KAN-292) → `CALENDAR_EMPTY_LINE` draws in `PondBlockEmpty`'s emptyBox
 * with the `add a date field` remedy, but only when `onAddDateField` is wired — a
 * read-only render (no handler, same as a date property with zero rows) keeps the
 * board's bare `emptyLine` span instead; there is no button to offer.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { cn } from '@/lib/utils'
import { PondAtom } from '@/components/atoms/PondAtom'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import type { PropertyDef, PropertySchema, PropertyValue } from '@/lib/properties/schema'
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
import { addDays, pickDateDef, type CollectionRow } from './apply'
import {
  DAY_GUTTER,
  DAY_HOUR_END,
  DAY_HOUR_START,
  DAY_ROW_HEIGHT,
  dayHourLabels,
  dayPeriodLabel,
  nowLineTop,
  splitDayRows,
  stepDay,
  stripWeek,
  type DayMetricSize,
  type DayTimedRow,
  type StripDay,
} from './calendar-day'
import {
  agendaExtensionsAfterReach,
  agendaPeriodLabel,
  agendaRange,
  buildAgenda,
  stepAgenda,
  type AgendaGroup,
} from './calendar-agenda'
import { stepWeek, weekPeriodLabel, weekRange } from './calendar-week'
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

const NAV_BTN =
  'inline-flex size-11 items-center justify-center rounded-mn-pill text-mn-text hover:bg-mn-hover-fill md:size-7'

/**
 * The header's span pill, month then week then day then agenda
 * (`PondCalendar.dc.html` line 133).
 */
export const CALENDAR_SPANS = ['month', 'week', 'day', 'agenda'] as const
export type CalendarSpan = (typeof CALENDAR_SPANS)[number]

/** Track, `seg` at line 143: gap 4, padding 3, radius 999, weight 500, 12px mobile / 10.5px desktop. */
const SPAN_TRACK =
  'flex items-center gap-[4px] rounded-[999px] bg-[rgba(27,29,20,.055)] p-[3px] text-[12px] leading-[normal] font-medium dark:bg-[rgba(250,249,239,.08)] md:text-[10.5px]'
/** Each segment, line 133: padding 9px 11px mobile / 4px 10px desktop, radius 999.
 *  Selected is ink on paper, and the swap on dark — `mn-text` / `mn-surface` (#1B1D14 / #FAF9EF). */
const SPAN_SEGMENT = `cursor-pointer rounded-[999px] px-[11px] py-[9px] text-mn-text-secondary md:px-[10px] md:py-[4px] data-[checked]:bg-mn-text data-[checked]:text-mn-surface ${FOCUS_VISIBLE_RING}`

/** `DW` — the DC's lowercase weekday short-forms; `textTransform: uppercase` draws them caps. */
const DOW_LABELS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DOW_HEAD =
  'px-2 pb-1.5 text-left text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
/** The DC's mobile `dows` style: centered, `padding: '0 0 4px'` instead of the desktop row's side padding. */
const DOW_HEAD_MOBILE =
  'pb-1 text-center text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
/** The DC's `todayNum(t,22,12,inM)`: today gets the one burnt-orange chip per screen. */
const DAY_NUMBER =
  'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12px] font-medium tabular-nums'
/** The DC's stack item row: `gap 6 · height 20 · padding 0 4 · radius 6`. */
const DAY_ITEM_ROW = 'flex h-5 items-center gap-1.5 rounded-[6px] px-1'
/** `PondCalendar.dc.html`'s `ring(o)`: a selected item's own 1.5px inset ink ring. */
const DAY_ITEM_SELECTED_RING = 'ring-[1.5px] ring-inset ring-mn-text'
/** `boxSt(o,9)`: a 9px dot, `boxShadow: inset 0 0 0 1.4px a(.32)` for a live (non-done) row. */
const DAY_ITEM_DOT =
  'size-[9px] flex-none rounded-[2.5px] box-border ring-[1.4px] ring-inset ring-mn-text/[0.32]'
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
/**
 * Phone week strip (`PondCalendar.dc.html` lines 185–192). The column carries
 * the 1.4px inset, including when the open day is today. The number is 14px —
 * the month grid's mobile chip is 13px and is not reused here.
 */
const STRIP_COLUMN = 'flex flex-col items-center gap-1 rounded-[14px] py-[6px]'
const STRIP_DOW = 'text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
const STRIP_NUMBER =
  'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px] font-medium tabular-nums'
const STRIP_DOT = 'size-1 flex-none rounded-full'
/** The focused-day list's own head chip: `todayNum(t,30,20)`, `alignSelf: 'flex-start'`. */
const DAY_NUMBER_LIST =
  'inline-flex h-[30px] min-w-[30px] self-start text-[20px] font-medium tabular-nums'
/** `boxSt(o,13)`: the focused-day list's larger dot, `radius 4` (`sz > 11`). */
const DAY_ITEM_DOT_LARGE =
  'size-[13px] flex-none rounded-[4px] box-border ring-[1.4px] ring-inset ring-mn-text/[0.32]'
/**
 * Agenda day group (`PondCalendar.dc.html` lines 239–244). One list at both
 * sizes: 52px / gap 8, and from `md` 88px / gap 16. Hair is the top border.
 */
const AGENDA_DAY =
  'grid grid-cols-[52px_minmax(0,1fr)] gap-2 border-t border-mn-text/[0.09] py-2.5 dark:border-mn-text/[0.14] md:grid-cols-[88px_minmax(0,1fr)] md:gap-4'
/** Head column: gap 2, padding-top 6. */
const AGENDA_HEAD = 'flex flex-col gap-0.5 pt-1.5'
/** `` `${dow} ${day} ${abbr}` ``, uppercase 10.5px tracking .1em, ink .68. */
const AGENDA_LABEL = 'text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
/** Row: flex, center, gap 10, min-height 44 / 38 from `md`, padding 0 8px, radius 10. */
const AGENDA_ITEM = 'flex min-h-11 min-w-0 items-center gap-2.5 rounded-[10px] px-2 md:min-h-[38px]'
/** Title: 15px, 14px from `md`, leading 1.3. */
const AGENDA_TITLE = 'min-w-0 flex-1 truncate text-[15px] leading-[1.3] text-mn-text md:text-[14px]'
/** Timed meta: sliced `HH:MM`, 11px weight 500, ink .8. */
const AGENDA_TIME = 'flex-none text-[11px] font-medium text-mn-text/80 tabular-nums'
/** Board `noneStyle`: 13px, ink .68, padding `10px 0`. The day line `nothing dated`. */
const AGENDA_NONE = 'py-2.5 text-[13px] text-mn-text-secondary'
/** The day cell's add mark. Hidden until that cell is hovered or focus-within.
 *  Named `group/day`, not a bare `group`: BlockCanvas's block wrapper is already
 *  `group`, and a bare one would reveal every day's plus as soon as the pointer
 *  entered the block. */
const DAY_ADD_BUTTON =
  'absolute right-1 top-1 text-mn-text-secondary opacity-0 group-hover/day:opacity-100 group-focus-within/day:opacity-100'
/** Armed placement (KAN-454): the same hover fill as the month nav, so a day reads as a target. */
const DAY_PLACE_HOVER = 'cursor-pointer hover:bg-mn-hover-fill'
const UNDATED_LINE = 'px-0.5 text-left text-[13px] font-mono lowercase text-mn-text-secondary'

function MonthDayNumber({
  day,
  isToday,
  inMonth,
}: {
  day: number
  isToday: boolean
  inMonth: boolean
}) {
  if (isToday) {
    return <PondAtom kind="date" due="today" value={String(day)} className={DAY_NUMBER} />
  }
  return (
    <span className={cn(DAY_NUMBER, inMonth ? 'text-mn-text' : 'text-mn-text-secondary')}>
      {day}
    </span>
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
            handleCalendarRowClick(
              row.id,
              selectedId,
              selectWithPointer,
              onOpenRow,
              isClickSuppressed,
              e
            )
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
  onPlace,
  onOpenDay,
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
  /** Armed placement (KAN-454): a click on this day writes that date. */
  onPlace?: (iso: string) => void
  /** Blank space (the day number or the cell padding) opens this day. */
  onOpenDay: (iso: string) => void
}) {
  // A stack item's Enter bubbles. Only the cell itself adds; the item's own
  // Enter still selects (KAN-358). A blank click opens the day (KAN-455).
  // A drag's trailing click is suppressed, and an armed click dates the record.
  const handleCellClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isClickSuppressed()) return
    event.stopPropagation()
    if (onPlace) {
      onPlace(cell.iso)
      return
    }
    onOpenDay(cell.iso)
  }
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
      onClick={handleCellClick}
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
        <PondAtom
          kind="date"
          due="today"
          value={String(cell.dayOfMonth)}
          className={DAY_NUMBER_MOBILE}
        />
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
    <span className={cn(DAY_NUMBER_LIST, 'items-center justify-start px-0 text-mn-text')}>
      {day}
    </span>
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
          <span className={AGENDA_NONE}>nothing dated</span>
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
                handleCalendarRowClick(
                  row.id,
                  selectedId,
                  selectWithPointer,
                  onOpenRow,
                  isClickSuppressed,
                  e
                )
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

/** `` `${dow} ${day} ${month}` ``, plus ` · today` when the group is today. */
function agendaDayLabel(iso: string, todayIso: string): string {
  const day = Number(iso.slice(8, 10))
  const label = `${DOW_LABELS[weekdayIndex(iso)]} ${day} ${monthAbbr(iso)}`
  return iso === todayIso ? `${label} · today` : label
}

const agendaGroupHasRows = (group: AgendaGroup): boolean =>
  group.rows.untimed.length > 0 || group.rows.timed.length > 0

/** The board's day line when a shown day, or a whole empty window, has no rows. */
const AgendaNone = () => <span className={AGENDA_NONE}>nothing dated</span>

/**
 * One agenda row. The click and key calls are the month stack's: the first
 * click selects and the peek `CollectionCalendar` already mounts for
 * `selectedRow` opens; a second click on the selected row opens the page.
 */
function AgendaItem({
  row,
  timeLabel,
  selectedId,
  isClickSuppressed,
  rowProps,
  keyboardProps,
  selectWithPointer,
  selectOrOpenOnKey,
  onOpenRow,
}: {
  row: CollectionRow
  timeLabel?: string
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
      data-part="calendar-agenda-item"
      className={cn(
        AGENDA_ITEM,
        ROW_FOCUS_VISIBLE,
        row.id === selectedId && DAY_ITEM_SELECTED_RING
      )}
      {...rowProps(row.id)}
      {...keyboardProps(row.id)}
      onKeyDown={(e) => selectOrOpenOnKey(row.id, e, onOpenRow)}
      onClick={(e) =>
        handleCalendarRowClick(
          row.id,
          selectedId,
          selectWithPointer,
          onOpenRow,
          isClickSuppressed,
          e
        )
      }
    >
      <span className={DAY_ITEM_DOT_LARGE} />
      <span className={AGENDA_TITLE}>{row.title}</span>
      {timeLabel ? (
        <span data-part="calendar-agenda-time" className={AGENDA_TIME}>
          {timeLabel}
        </span>
      ) : null}
    </div>
  )
}

/**
 * The agenda span's list (`PondCalendar.dc.html` lines 239–244). Groups are
 * `buildAgenda`: untimed rows, then timed rows. An untimed row has no time node.
 * Today with no rows keeps its heading and draws `nothing dated` under it. A
 * window with no groups draws that line once, with no day heading. An empty
 * sentinel after those groups is observed against the viewport; reaching it
 * asks the calendar to extend the list. No observer means the list stays put.
 */
function AgendaList({
  groups,
  todayIso,
  selectedId,
  isClickSuppressed,
  rowProps,
  keyboardProps,
  selectWithPointer,
  selectOrOpenOnKey,
  onOpenRow,
  onReach,
}: {
  groups: readonly AgendaGroup[]
  todayIso: string
  selectedId?: string
  isClickSuppressed: PointerBucketDrag['isClickSuppressed']
  rowProps: RowSelection['rowProps']
  keyboardProps: RowSelection['keyboardProps']
  selectWithPointer: RowSelection['selectWithPointer']
  selectOrOpenOnKey: RowSelection['selectOrOpenOnKey']
  onOpenRow?: (rowId: string) => void
  onReach: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const node = endRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        onReach()
      },
      { root: null }
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [onReach])
  const itemProps = {
    selectedId,
    isClickSuppressed,
    rowProps,
    keyboardProps,
    selectWithPointer,
    selectOrOpenOnKey,
    onOpenRow,
  }
  return (
    <div data-part="calendar-agenda" className="flex flex-col">
      {groups.length === 0 ? (
        <AgendaNone />
      ) : (
        groups.map((group) => (
          <div
            key={group.iso}
            data-part="calendar-agenda-day"
            data-iso={group.iso}
            className={AGENDA_DAY}
          >
            <div className={AGENDA_HEAD}>
              <FocusedDayNumber
                day={Number(group.iso.slice(8, 10))}
                isToday={group.iso === todayIso}
              />
              <span className={AGENDA_LABEL}>{agendaDayLabel(group.iso, todayIso)}</span>
            </div>
            <div className="flex flex-col">
              {agendaGroupHasRows(group) ? (
                <>
                  {group.rows.untimed.map((row) => (
                    <AgendaItem key={row.id} row={row} {...itemProps} />
                  ))}
                  {group.rows.timed.map((timed) => (
                    <AgendaItem
                      key={timed.row.id}
                      row={timed.row}
                      timeLabel={timed.timeLabel}
                      {...itemProps}
                    />
                  ))}
                </>
              ) : (
                <AgendaNone />
              )}
            </div>
          </div>
        ))
      )}
      <div ref={endRef} data-part="calendar-agenda-end" aria-hidden="true" />
    </div>
  )
}

function DayPlus() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 2.4v7.2M2.4 6h7.2" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 2.5L4 6l3.5 3.5" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 2.5L8 6 4.5 9.5" />
    </svg>
  )
}

function SpanPill({
  value,
  onChange,
}: {
  value: CalendarSpan
  onChange: (span: CalendarSpan) => void
}) {
  return (
    <RadioGroup aria-label="span" value={value} onValueChange={onChange} className={SPAN_TRACK}>
      {CALENDAR_SPANS.map((option) => (
        <Radio.Root key={option} value={option} className={SPAN_SEGMENT}>
          {option}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

/** `adLabel`: 10.5px, weight 500, ink .68, centered in the gutter track. */
const ALL_DAY_LABEL = 'self-center text-[10.5px] font-medium text-mn-text-secondary'
/** Untimed row: height 22, margin 1px 2px, gap 6, padding 0 6px, radius 6. Title is 11.5px weight 500. */
const ALL_DAY_ITEM =
  'mx-[2px] my-px flex h-[22px] min-w-0 items-center gap-[6px] rounded-[6px] px-[6px]'
const ALL_DAY_TITLE = 'min-w-0 flex-1 truncate text-[11.5px] font-medium leading-[1.3] text-mn-text'
/** Hour labels, the DC's `h.style`: 10.5px, weight 500, ink .68, tabular. */
const HOUR_LABEL = 'absolute left-0 text-[10.5px] font-medium text-mn-text-secondary tabular-nums'
/**
 * Timed event, `evBg` / `evShadow` / radius 8. Fill is paper in light and
 * neutral-600 in dark (#FAF9EF / #4A4940), the `mn-drag-ghost` pair. Title
 * 12px weight 500; time is `mSt(10.5)` — 10.5px, weight 500, ink .80, tabular.
 */
const TIMED_EVENT =
  'absolute right-1 left-1 z-[1] box-border flex overflow-hidden rounded-[8px] bg-mn-drag-ghost shadow-[0_1px_2px_rgba(40,34,24,.08),0_2px_8px_rgba(40,34,24,.07)] dark:shadow-[0_1px_2px_rgba(0,0,0,.3),0_2px_8px_rgba(0,0,0,.3)]'
const TIMED_TITLE = 'truncate text-[12px] font-medium leading-[1.25] text-mn-text'
const TIMED_TIME = 'flex-none text-[10.5px] font-medium text-mn-text/80 tabular-nums'
/** Hair across the day column and the all-day rule: `a(ink ? .14 : .09)`. */
const DAY_HAIR_BORDER = 'border-mn-text/[0.09] dark:border-mn-text/[0.14]'
const DAY_HAIR_LINE = 'bg-mn-text/[0.09] dark:bg-mn-text/[0.14]'

/** Local `HH:MM` off the mounted clock. The day grid never `Date`-parses a row. */
function clockHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Desktop week head, the DC's `tDays` (`todayNum(t, 26, 15)`). */
const WEEK_HEAD_DOW = 'text-[10.5px] font-medium uppercase tracking-[.1em] text-mn-text-secondary'
const WEEK_NUMBER =
  'inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-1 text-[15px] font-medium tabular-nums'
/** `52px repeat(7,minmax(0,1fr))` — gutter plus Monday-first days. */
const WEEK_COLUMNS = '52px repeat(7,minmax(0,1fr))'

/**
 * Desktop week body (`isTime` for `span === 'week'`, `PondCalendar.dc.html`
 * lines 194–228). Day heads, the all-day row (`adRow`, lines 204–216), then the
 * hour grid. A date with no `T` sits in that day's column; a timed row stays in
 * the hours. One date per row — no multi-day bars. Positions reuse the day
 * span's hour geometry. An empty hour is not a control; a day head opens that day.
 */
function WeekBody({
  startIso,
  todayIso,
  nowHm,
  rows,
  dateDef,
  onOpenDay,
  editable,
  drag,
  overKey,
  registerBucket,
  onCardPointerDown,
  containerHandlers,
  containerClassName,
}: {
  startIso: string
  todayIso: string
  nowHm: string
  rows: CollectionRow[]
  dateDef: PropertyDef | undefined
  onOpenDay: (iso: string) => void
  editable?: boolean
  drag: PointerBucketDrag['drag']
  overKey: PointerBucketDrag['overKey']
  registerBucket: PointerBucketDrag['registerBucket']
  onCardPointerDown: PointerBucketDrag['onCardPointerDown']
  containerHandlers: PointerBucketDrag['containerHandlers']
  containerClassName: PointerBucketDrag['containerClassName']
}) {
  const rowHeight = DAY_ROW_HEIGHT.desktop
  const gutter = DAY_GUTTER.desktop
  const bodyHeight = (DAY_HOUR_END - DAY_HOUR_START) * rowHeight
  const hours = dayHourLabels()
  const days = Array.from({ length: 7 }, (_, offset) => addDays(startIso, offset))
  const untimedByDay = days.map((iso) => splitDayRows(rows, dateDef, iso).untimed)
  const allDayTracks = Math.max(1, ...untimedByDay.map((items) => items.length))

  return (
    <div
      data-part="calendar-week-body"
      data-size="desktop"
      className={cn('hidden md:flex md:flex-col', containerClassName)}
      {...containerHandlers}
    >
      <div className="grid" style={{ gridTemplateColumns: WEEK_COLUMNS }}>
        <span />
        {DOW_LABELS.map((word, index) => {
          const iso = days[index]
          if (!iso) return null
          const day = Number(iso.slice(8, 10))
          const isToday = iso === todayIso
          return (
            <button
              key={iso}
              type="button"
              aria-label={`${word} ${day}`}
              onClick={() => onOpenDay(iso)}
              className="flex items-center gap-2 px-2 pb-2"
            >
              <span className={WEEK_HEAD_DOW}>{word}</span>
              {isToday ? (
                <PondAtom kind="date" due="today" value={String(day)} className={WEEK_NUMBER} />
              ) : (
                <span className={cn(WEEK_NUMBER, 'text-mn-text')}>{day}</span>
              )}
            </button>
          )
        })}
      </div>
      <div
        data-part="calendar-all-day"
        className={cn('grid border-y py-[6px]', DAY_HAIR_BORDER)}
        style={{
          gridTemplateColumns: WEEK_COLUMNS,
          gridTemplateRows: `repeat(${allDayTracks}, 24px)`,
        }}
      >
        <span className={ALL_DAY_LABEL} style={{ gridColumn: 1, gridRow: 1 }}>
          all day
        </span>
        {untimedByDay.map((items, index) =>
          items.map((row, rowIndex) => (
            <div
              key={row.id}
              data-part="calendar-all-day-item"
              className={cn(ALL_DAY_ITEM, drag?.active && drag.rowId === row.id && DRAG_LIFT_CLASS)}
              style={{ gridColumn: index + 2, gridRow: rowIndex + 1 }}
              onPointerDown={editable ? (e) => onCardPointerDown(e, row.id) : undefined}
            >
              <span className={DAY_ITEM_DOT} />
              <span className={ALL_DAY_TITLE}>{row.title}</span>
            </div>
          ))
        )}
      </div>
      <div
        data-part="calendar-hour-grid"
        className="relative mt-[6px] grid"
        style={{
          height: bodyHeight,
          gridTemplateColumns: WEEK_COLUMNS,
          gridTemplateRows: `${bodyHeight}px`,
        }}
      >
        {hours.map((label, index) => (
          <span
            key={label}
            data-part="calendar-hour-line"
            aria-hidden
            className={cn('absolute right-0 h-px', DAY_HAIR_LINE)}
            style={{ left: gutter, top: index * rowHeight }}
          />
        ))}
        {hours.map((label, index) => (
          <span
            key={`label-${label}`}
            data-part="calendar-hour-label"
            className={HOUR_LABEL}
            style={{ top: index * rowHeight - 6, width: gutter }}
          >
            {label}
          </span>
        ))}
        {days.map((iso, index) => {
          const weekend = weekdayIndex(iso) > 4
          const timed = splitDayRows(rows, dateDef, iso).timed
          const nowTop = nowLineTop(iso, todayIso, nowHm, 'desktop')
          return (
            <div
              key={iso}
              data-part="calendar-week-column"
              data-iso={iso}
              ref={registerBucket(iso)}
              className={cn(
                'relative border-l',
                DAY_HAIR_BORDER,
                drag?.active && overKey === iso ? DRAG_OVER_CLASS : weekend && 'bg-mn-text/[0.025]'
              )}
              style={{ gridRow: 1, gridColumn: index + 2 }}
            >
              {timed.map((event) => {
                const top = (event.startHours - DAY_HOUR_START) * rowHeight + 1
                const height = Math.max((event.endHours - event.startHours) * rowHeight - 3, 22)
                const compact = height < 34
                return (
                  <div
                    key={event.row.id}
                    data-part="calendar-timed-event"
                    className={cn(
                      TIMED_EVENT,
                      compact
                        ? 'flex-row items-center gap-[6px] px-2 py-[3px]'
                        : 'flex-col items-stretch gap-[2px] px-2 py-[6px]',
                      drag?.active && drag.rowId === event.row.id && DRAG_LIFT_CLASS
                    )}
                    style={{ top, height }}
                    onPointerDown={editable ? (e) => onCardPointerDown(e, event.row.id) : undefined}
                  >
                    <span className={cn(TIMED_TITLE, compact && 'min-w-0 flex-1')}>
                      {event.row.title}
                    </span>
                    <span data-part="calendar-event-time" className={TIMED_TIME}>
                      {event.timeLabel}
                    </span>
                  </div>
                )
              })}
              {nowTop !== null ? (
                <span
                  data-part="calendar-now"
                  className="absolute right-0 left-0 z-[2] h-[1.4px] bg-mn-text"
                  style={{ top: nowTop }}
                >
                  <span
                    data-part="calendar-now-dot"
                    className="absolute top-[-3px] left-[-4px] size-[7px] rounded-full bg-mn-text"
                  />
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Phone week strip on the day span (`PondCalendar.dc.html` lines 185–192).
 * One `md:hidden` grid, drawn before both day bodies. A tap sets the open
 * day (`pick`, `off: 0`) and does not change the span.
 */
function CalendarWeekStrip({
  days,
  todayIso,
  onSelect,
}: {
  days: StripDay[]
  todayIso: string
  onSelect: (iso: string) => void
}) {
  return (
    <div data-part="calendar-week-strip" className="grid grid-cols-7 gap-0.5 md:hidden">
      {DOW_LABELS.map((word, index) => {
        const day = days[index]
        if (!day) return null
        const isToday = day.iso === todayIso
        return (
          <button
            key={day.iso}
            type="button"
            aria-label={`${word} ${day.day}`}
            aria-current={day.isFocus ? 'date' : undefined}
            onClick={() => onSelect(day.iso)}
            className={cn(STRIP_COLUMN, day.isFocus && DAY_NUMBER_FOCUS_RING)}
          >
            <span className={STRIP_DOW}>{day.letter}</span>
            {isToday ? (
              <PondAtom kind="date" due="today" value={String(day.day)} className={STRIP_NUMBER} />
            ) : (
              <span className={cn(STRIP_NUMBER, 'text-mn-text')}>{day.day}</span>
            )}
            <span className={cn(STRIP_DOT, day.hasDot ? 'bg-mn-text' : 'bg-transparent')} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * The day span's body (`isTime` for `span === 'day'`): the all-day row, then the
 * hour grid. Positions come from `calendar-day.ts` — row height, gutter, the
 * sliced start, and `nowLineTop`. One copy per metric so a phone is the same
 * grid, not an empty card. Markup only: rows are not controls here.
 */
function DayBody({
  size,
  focusIso,
  todayIso,
  nowHm,
  untimed,
  timed,
}: {
  size: DayMetricSize
  focusIso: string
  todayIso: string
  nowHm: string
  untimed: CollectionRow[]
  timed: DayTimedRow[]
}) {
  const rowHeight = DAY_ROW_HEIGHT[size]
  const gutter = DAY_GUTTER[size]
  const bodyHeight = (DAY_HOUR_END - DAY_HOUR_START) * rowHeight
  const tracks = Math.max(1, untimed.length)
  const hours = dayHourLabels()
  const nowTop = nowLineTop(focusIso, todayIso, nowHm, size)
  const weekend = weekdayIndex(focusIso) > 4
  const frame = size === 'desktop' ? 'hidden md:flex md:flex-col' : 'flex flex-col md:hidden'

  return (
    <div data-part="calendar-day-body" data-size={size} className={frame}>
      <div
        data-part="calendar-all-day"
        className={cn('grid border-y py-[6px]', DAY_HAIR_BORDER)}
        style={{
          gridTemplateColumns: `${gutter}px minmax(0,1fr)`,
          gridTemplateRows: `repeat(${tracks}, 24px)`,
        }}
      >
        <span className={ALL_DAY_LABEL} style={{ gridColumn: 1, gridRow: 1 }}>
          all day
        </span>
        {untimed.map((row, index) => (
          <div
            key={row.id}
            data-part="calendar-all-day-item"
            className={ALL_DAY_ITEM}
            style={{ gridColumn: 2, gridRow: index + 1 }}
          >
            <span className={DAY_ITEM_DOT} />
            <span className={ALL_DAY_TITLE}>{row.title}</span>
          </div>
        ))}
      </div>
      <div
        data-part="calendar-hour-grid"
        className="relative mt-[6px]"
        style={{ height: bodyHeight }}
      >
        {hours.map((label, index) => (
          <span
            key={label}
            data-part="calendar-hour-line"
            aria-hidden
            className={cn('absolute right-0 h-px', DAY_HAIR_LINE)}
            style={{ left: gutter, top: index * rowHeight }}
          />
        ))}
        {hours.map((label, index) => (
          <span
            key={`label-${label}`}
            data-part="calendar-hour-label"
            className={HOUR_LABEL}
            style={{ top: index * rowHeight - 6, width: gutter }}
          >
            {label}
          </span>
        ))}
        <div
          className={cn(
            'absolute top-0 right-0 bottom-0 border-l',
            DAY_HAIR_BORDER,
            weekend && 'bg-mn-text/[0.025]'
          )}
          style={{ left: gutter }}
        >
          {timed.map((event) => {
            const top = (event.startHours - DAY_HOUR_START) * rowHeight + 1
            const height = Math.max((event.endHours - event.startHours) * rowHeight - 3, 22)
            const compact = height < 34
            return (
              <div
                key={event.row.id}
                data-part="calendar-timed-event"
                className={cn(
                  TIMED_EVENT,
                  compact
                    ? 'flex-row items-center gap-[6px] px-2 py-[3px]'
                    : 'flex-col items-stretch gap-[2px] px-2 py-[6px]'
                )}
                style={{ top, height }}
              >
                <span className={cn(TIMED_TITLE, compact && 'min-w-0 flex-1')}>
                  {event.row.title}
                </span>
                <span data-part="calendar-event-time" className={TIMED_TIME}>
                  {event.timeLabel}
                </span>
              </div>
            )
          })}
          {nowTop !== null ? (
            <span
              data-part="calendar-now"
              className="absolute right-0 left-0 z-[2] h-[1.4px] bg-mn-text"
              style={{ top: nowTop }}
            >
              <span
                data-part="calendar-now-dot"
                className="absolute top-[-3px] left-[-4px] size-[7px] rounded-full bg-mn-text"
              />
            </span>
          ) : null}
        </div>
      </div>
    </div>
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
  span: spanProp,
  onConfigChange,
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
  /** The active view's stored span. Absent reads as month. */
  span?: CalendarSpan
  /** Present when the host persists config. A span click sends `{ span }`. */
  onConfigChange?: (patch: { span: CalendarSpan }) => void
}) {
  const dateDef = useMemo(() => pickDateDef(schema, groupBy), [schema, groupBy])
  // `today` is read once per mount, as the board reads its own `now` (view.tsx);
  // the local calendar date, matching `due.ts`'s `dueAtom`, not UTC's.
  const [todayIso] = useState(() => localDateIso(new Date()))
  const [now] = useState(() => new Date())
  const [focusIso, setFocusIso] = useState(todayIso)
  const [agendaExtensions, setAgendaExtensions] = useState(0)
  // Local span, seeded from the view field. A later change to that field
  // (another saved view) drops the override so the pill follows the view again.
  const seededSpan: CalendarSpan = spanProp ?? 'month'
  const [spanOverride, setSpanOverride] = useState<CalendarSpan | null>(null)
  const [spanSeed, setSpanSeed] = useState(seededSpan)
  if (spanSeed !== seededSpan) {
    setSpanSeed(seededSpan)
    setSpanOverride(null)
  }
  const span = spanOverride ?? seededSpan

  const handleSpanChange = (next: CalendarSpan) => {
    setSpanOverride(next)
    onConfigChange?.({ span: next })
  }
  const grid = useMemo(
    () => buildMonthGrid(focusIso, todayIso, rows, dateDef),
    [dateDef, focusIso, todayIso, rows]
  )
  const dayRows = useMemo(() => splitDayRows(rows, dateDef, focusIso), [dateDef, focusIso, rows])
  const weekStrip = useMemo(() => stripWeek(focusIso, rows, dateDef), [dateDef, focusIso, rows])
  // The open focus is session state. A week span labels `weekRange` of that
  // focus and steps seven days; a day span labels and steps that day; an
  // agenda span labels `agendaRange(focus).start` (`from 19 oct`) and steps
  // fourteen days via `stepAgenda`; a month span keeps the month label and
  // `stepMonth`. `today` only moves the focus, so it never leaves the span.
  // A week span draws the desktop week body (day heads, all-day row, hour
  // grid). On a phone (`mob && span === 'week'`) that grid stays hidden: the
  // week strip and the focused-day list show instead, and a strip tap only
  // moves the focus. An agenda span draws `buildAgenda` and none of those.
  const openWeek = span === 'week' ? weekRange(focusIso) : null
  const openAgenda = span === 'agenda' ? agendaRange(focusIso) : null
  const agendaGroups = useMemo(
    () =>
      span === 'agenda' ? buildAgenda(focusIso, todayIso, rows, dateDef, agendaExtensions) : [],
    [agendaExtensions, dateDef, focusIso, rows, span, todayIso]
  )
  const handleAgendaReach = useCallback(() => {
    setAgendaExtensions((current) =>
      agendaExtensionsAfterReach(focusIso, rows, dateDef, current)
    )
  }, [dateDef, focusIso, rows])
  const periodLabel = openAgenda
    ? agendaPeriodLabel(openAgenda.start)
    : openWeek
      ? weekPeriodLabel(openWeek.start, openWeek.end)
      : span === 'day'
        ? dayPeriodLabel(focusIso)
        : grid.periodLabel
  const stepFocus = openAgenda
    ? stepAgenda
    : openWeek
      ? stepWeek
      : span === 'day'
        ? stepDay
        : stepMonth
  const previousName = openAgenda
    ? 'Previous agenda'
    : openWeek
      ? 'Previous week'
      : span === 'day'
        ? 'Previous day'
        : 'Previous month'
  const nextName = openAgenda
    ? 'Next agenda'
    : openWeek
      ? 'Next week'
      : span === 'day'
        ? 'Next day'
        : 'Next month'
  const handleStepFocus = (direction: -1 | 1) => {
    setAgendaExtensions(0)
    setFocusIso((current) => stepFocus(current, direction))
  }
  const handleToday = () => {
    setAgendaExtensions(0)
    setFocusIso(goToday(todayIso))
  }
  // Desktop `goDay`: blank space opens that day. A mobile month dot only moves
  // the focus (`mob && span !== 'day'` keeps the span).
  const handleOpenDay = (iso: string) => {
    setFocusIso(iso)
    handleSpanChange('day')
  }

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

  // The same own edit a drop uses: `onMoveDate` is `setValueAsStep` (KAN-385).
  // A click on the row's own day writes nothing. Clearing the arm is the gesture ending.
  const handlePlaceOnDay = (iso: string) => {
    if (!placement || !dateDef || !onMoveDate) return
    const row = rows.find((candidate) => candidate.id === placement.id)
    if (row && rowDateIso(row, dateDef) !== iso) {
      onMoveDate(placement.id, dateDef.id, dateForDrop(row.values[dateDef.id], iso))
    }
    setPlacement(null)
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

  const nowHm = clockHm(now)
  const focusIsToday = focusIso === todayIso
  const focusDayOfMonth = Number(focusIso.slice(8, 10))
  const focusLabel = `${DOW_LABELS[weekdayIndex(focusIso)]} ${monthAbbr(focusIso)}${focusIsToday ? ' · today' : ''}`
  const focusItems = dayItems(rows, dateDef, focusIso)
  const undatedRows = dateDef ? rows.filter((row) => rowDateIso(row, dateDef) === null) : []
  const undatedCount = undatedRows.length
  const showUndatedLine = !!dateDef && undatedCount > 0
  // The calendar's own empty (no date field, no rows, or every row undated)
  // already draws its line. Agenda must not add its list or `nothing dated`.
  const calendarOwnEmpty = !dateDef || rows.length === 0 || undatedCount === rows.length
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
            {periodLabel}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label={previousName}
              onClick={() => handleStepFocus(-1)}
              className={NAV_BTN}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              aria-label={nextName}
              onClick={() => handleStepFocus(1)}
              className={NAV_BTN}
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-normal">
          <SpanPill value={span} onChange={handleSpanChange} />
          <button
            type="button"
            onClick={handleToday}
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
          pageMarkClassName={DAY_ITEM_DOT}
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
      {span === 'day' ? (
        <>
          <CalendarWeekStrip days={weekStrip} todayIso={todayIso} onSelect={setFocusIso} />
          <DayBody
            size="desktop"
            focusIso={focusIso}
            todayIso={todayIso}
            nowHm={nowHm}
            untimed={dayRows.untimed}
            timed={dayRows.timed}
          />
          <DayBody
            size="mobile"
            focusIso={focusIso}
            todayIso={todayIso}
            nowHm={nowHm}
            untimed={dayRows.untimed}
            timed={dayRows.timed}
          />
        </>
      ) : openWeek ? (
        <>
          <CalendarWeekStrip days={weekStrip} todayIso={todayIso} onSelect={setFocusIso} />
          <WeekBody
            startIso={openWeek.start}
            todayIso={todayIso}
            nowHm={nowHm}
            rows={rows}
            dateDef={dateDef}
            onOpenDay={handleOpenDay}
            editable={editable}
            drag={drag}
            overKey={overKey}
            registerBucket={registerBucket}
            onCardPointerDown={onCardPointerDown}
            containerHandlers={containerHandlers}
            containerClassName={containerClassName}
          />
        </>
      ) : span === 'agenda' ? (
        calendarOwnEmpty ? null : (
          <AgendaList
            groups={agendaGroups}
            todayIso={todayIso}
            selectedId={selectedRow?.id}
            isClickSuppressed={isClickSuppressed}
            rowProps={rowProps}
            keyboardProps={keyboardProps}
            selectWithPointer={selectWithPointer}
            selectOrOpenOnKey={selectOrOpenOnKey}
            onOpenRow={onOpenRow}
            onReach={handleAgendaReach}
          />
        )
      ) : (
        <>
          <div
            className={cn('hidden md:flex md:flex-col', containerClassName)}
            {...containerHandlers}
          >
            <div className="grid grid-cols-7">
              {DOW_LABELS.map((l) => (
                <span key={l} className={DOW_HEAD}>
                  {l}
                </span>
              ))}
            </div>
            {grid.weeks.map((week, w) => (
              <div
                key={w}
                className="grid grid-cols-7 border-t border-mn-text/[0.09] dark:border-mn-text/[0.14]"
              >
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
                    onPlace={placement ? handlePlaceOnDay : undefined}
                    onOpenDay={handleOpenDay}
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
        </>
      )}
      {span !== 'day' && span !== 'agenda' ? (
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
      ) : null}
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
