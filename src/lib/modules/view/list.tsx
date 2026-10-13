'use client'

/**
 * List view (`Pond 06.21` 6v): the collection's records as a checklist, grouped by
 * when they are due. One card — radius 20, padding 16/18, the 2u card shadow, gap 20
 * between groups — with a group label over each run of rows. It is read from the same
 * rows every other view draws; the groups come from `groupRowsByDue` at render time.
 *
 * A row's title is its tab stop: click, Enter or Space selects the record and opens
 * its peek (6u.2), exactly as a board card does. The checkbox is the person's own
 * edit — it writes the record's `done` status through `onEdit`.
 *
 * No date property on the collection (KAN-292) → `CALENDAR_EMPTY_LINE` draws in
 * `PondBlockEmpty`'s emptyBox, with the `add a date field` remedy when
 * `onAddDateField` is wired — the board's own line, true whether or not the
 * collection already holds records (unlike `LIST_EMPTY_LINE`, which means zero rows).
 */

import { useMemo, useState } from 'react'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import { type PropertySchema, type PropertyValue } from '@/lib/properties/schema'
import { useOrangeToday } from '../page-canvas'
import { displayValue, pickRepeatDef, type CollectionRow } from './apply'
import { RepeatMark } from './cells'
import { dueOfRow, firstOrangeToday } from './due'
import { DueMark } from './due-mark'
import { groupRowsByDue } from './due-buckets'
import { CALENDAR_EMPTY_LINE } from './kinds'
import { RecordCheck } from './record-check'
import { RecordPeek } from './record-peek'
import { useDoneToggle } from './use-done-toggle'
import { useRecordSelection } from './use-record-selection'

export const LIST_EMPTY_LINE = 'no records yet'

export function CollectionList({
  viewKey,
  schema,
  rows,
  groupBy,
  editable,
  onEdit,
  onRenameRow,
  onOpenRow,
  onAddDateField,
  today,
}: {
  /** The view block's id — what the page canvas keys its one peek and one orange pill by. */
  viewKey: string
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
  /** KAN-292: mint a `date` field onto this collection's schema, offered when it
   *  has none to group by. Absent when not editable — no undrawn affordance. */
  onAddDateField?: () => void
  /** The day the groups are measured from; read once per mount from the clock when absent. */
  today?: Date
}) {
  const [now] = useState(() => today ?? new Date())
  const grouped = useMemo(
    () => groupRowsByDue(rows, schema, now, groupBy),
    [rows, schema, now, groupBy]
  )
  const { rootRef, selection, selectedRow, rowProps, buttonProps } = useRecordSelection(
    rows,
    viewKey
  )
  const done = useDoneToggle({ schema, groupBy, editable, onEdit })
  const dueOf = dueOfRow(grouped?.dateDef, now)
  const orangeTodayId = useOrangeToday(
    viewKey,
    rootRef,
    firstOrangeToday(
      (grouped?.buckets ?? []).flatMap((b) => b.rows),
      dueOf,
      done.isDone
    )
  )

  if (!grouped) {
    return (
      <PondBlockEmpty line={CALENDAR_EMPTY_LINE} action="add a date field" onAction={onAddDateField} />
    )
  }
  const { buckets } = grouped
  const repeatDef = pickRepeatDef(schema)

  return (
    <div ref={rootRef}>
      <div
        data-part="list-card"
        className={[
          'flex flex-col gap-[20px] rounded-[20px] bg-mn-card px-[18px] py-[16px]',
          'shadow-[0_1px_2px_rgba(40,34,24,.04),0_8px_24px_rgba(40,34,24,.06)]',
          'dark:shadow-[0_1px_2px_rgba(0,0,0,.3),0_8px_24px_rgba(0,0,0,.36)]',
        ].join(' ')}
      >
        {buckets.length === 0 && (
          <span className="text-[14px] text-mn-text-secondary">{LIST_EMPTY_LINE}</span>
        )}
        {buckets.map((bucket) => (
          <section
            key={bucket.id}
            data-part="list-group"
            data-group={bucket.id}
            aria-label={bucket.id}
            className="flex flex-col"
          >
            <span
              data-part="list-group-label"
              aria-hidden
              className="pb-[4px] text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
            >
              {bucket.id}
            </span>
            <ul className="m-0 flex list-none flex-col p-0">
              {bucket.rows.map((row) => {
                const rowDone = done.isDone(row)
                const isSelected = row.id === selectedRow?.id
                const repeat = repeatDef ? displayValue(repeatDef, row.values[repeatDef.id]) : ''
                const title = row.title || 'Untitled'
                return (
                  <li
                    key={row.id}
                    data-part="list-row"
                    data-done={rowDone || undefined}
                    {...rowProps(row.id)}
                    // The negative margin lets the hairline run past the text.
                    className={[
                      '-mx-[6px] flex cursor-pointer items-center gap-[11px] rounded-[8px] border-b border-mn-text/[0.055] px-[6px] py-[8px] text-[14px]',
                      'outline-[1.5px] outline-offset-1 outline-mn-text/50',
                      isSelected ? 'outline-solid' : 'outline-none',
                      rowDone ? 'text-mn-text-secondary' : 'text-mn-text',
                    ].join(' ')}
                  >
                    <RecordCheck
                      done={rowDone}
                      label={`${title} done`}
                      onToggle={done.toggle && (() => done.toggle?.(row))}
                    />
                    <button
                      type="button"
                      {...buttonProps(row.id)}
                      className="flex flex-1 cursor-pointer flex-wrap items-baseline gap-[10px] rounded-[4px] border-0 bg-transparent p-0 text-left text-inherit outline-offset-2 focus-visible:outline-[1.5px] focus-visible:outline-mn-text/50 focus-visible:outline-solid"
                    >
                      {title}
                    </button>
                    {repeat && (
                      <span
                        data-part="list-repeat"
                        className="inline-flex items-center gap-[4px] text-[11px] font-medium text-mn-text-meta"
                      >
                        <RepeatMark />
                        {repeat}
                      </span>
                    )}
                    <span
                      data-part="list-due"
                      className="min-w-[64px] text-right text-[11px] font-medium text-mn-text-meta"
                    >
                      <DueMark
                        due={dueOf(row)}
                        orange={row.id === orangeTodayId}
                        part="list-due-text"
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {selectedRow && (
        <RecordPeek
          key={selectedRow.id}
          row={selectedRow}
          schema={schema}
          done={done.isDone(selectedRow)}
          onToggleDone={done.toggle && (() => done.toggle?.(selectedRow))}
          now={now}
          editable={editable}
          focusOnOpen={selection?.via === 'keyboard'}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}
    </div>
  )
}
