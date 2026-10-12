'use client'

/**
 * Calendar view — the month span (#262 1/3), from `PondCalendar.dc.html`. Chrome is
 * the period label, prev/next stepping and a `today` button; the grid itself (desktop
 * weeks, mobile dots plus the tapped day's own list, the DC's `showList` for
 * `mob && span === 'month'`) is built in the sibling items of this ticket. No date property
 * on the collection → the DC's `emptyLine` reads inside the root card, chrome and
 * grid still drawn (the DC's `isMonthD`/`isMonthM` don't depend on `isEmpty` — `empty`
 * only zeroes `recs`), unlike `CollectionGantt`'s `GANTT_EMPTY_LINE`, which swaps the
 * whole surface for `PondBlockEmpty`.
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { PondAtom } from '@/components/atoms/PondAtom'
import type { PropertySchema } from '@/lib/properties/schema'
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

function MonthDayStack({ items, moreCount }: { items: MonthDayCell['items']; moreCount: number }) {
  if (items.length === 0 && moreCount === 0) return null
  return (
    <div className="flex flex-col gap-px px-1 pt-0.5 pb-2">
      {items.map((row) => (
        <div key={row.id} className={DAY_ITEM_ROW}>
          <span className={DAY_ITEM_DOT} />
          <span className={DAY_ITEM_TITLE}>{row.title}</span>
        </div>
      ))}
      {moreCount > 0 && <span className={DAY_MORE}>{`＋${moreCount} more`}</span>}
    </div>
  )
}

function MonthDayCellView({ cell, columnIndex }: { cell: MonthDayCell; columnIndex: number }) {
  return (
    <div
      className={cn(
        'min-h-[108px] p-1.5',
        columnIndex !== 0 && 'border-l border-mn-text/[0.09] dark:border-mn-text/[0.14]',
        columnIndex >= 5 && 'bg-mn-text/[0.025]'
      )}
    >
      <MonthDayNumber day={cell.dayOfMonth} isToday={cell.isToday} inMonth={cell.inMonth} />
      <MonthDayStack items={cell.items} moreCount={cell.moreCount} />
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
  schema,
  rows,
  groupBy,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
}) {
  const dateDef = useMemo(() => pickDateDef(schema, groupBy), [schema, groupBy])
  // `today` is read once per mount, as the board reads its own `now` (view.tsx);
  // the local calendar date, matching `due.ts`'s `dueAtom`, not UTC's.
  const [todayIso] = useState(() => localDateIso(new Date()))
  const [focusIso, setFocusIso] = useState(todayIso)
  const grid = useMemo(
    () => buildMonthGrid(focusIso, todayIso, rows, dateDef),
    [dateDef, focusIso, todayIso, rows]
  )

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
      {!dateDef && (
        <span className="px-0.5 text-[13px] text-mn-text-secondary">{CALENDAR_EMPTY_LINE}</span>
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
              <MonthDayCellView key={cell.iso} cell={cell} columnIndex={i} />
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
    </div>
  )
}
