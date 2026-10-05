'use client'

/**
 * List view (`Pond 06.21` 6v): the collection's records as a checklist, grouped by
 * when they are due. One card — radius 20, padding 16/18, the 2u card shadow, gap 20
 * between groups — with a group label over each run of rows. It is read from the same
 * rows every other view draws; the groups come from `groupRowsByDue` at render time.
 *
 * A row is its own tab stop: click, Enter or Space selects it and opens the record
 * peek (6u.2), exactly as a board card does. The checkbox is the person's own edit —
 * it writes the record's `done` status through `onEdit`.
 */

import { useMemo, useState } from 'react'
import { PondDueToday } from '@/components/atoms/PondAtom'
import { coerceValue, type PropertySchema, type PropertyValue } from '@/lib/properties/schema'
import { displayValue, pickRepeatDef, type CollectionRow } from './apply'
import { RepeatMark } from './cells'
import { shouldOpenCardFromClick } from './card-click'
import { dueAtom, type DueAtom } from './due'
import { groupRowsByDue, isRowDone, type DoneState } from './due-buckets'
import { ViewNotice } from './notice'
import { RecordPeek } from './record-peek'
import { useRecordSelection } from './use-record-selection'

export const LIST_EMPTY_LINE = 'no records yet'

/** The 15px box (`Pond 02` 2u): open is an inset 1.4px ring at ink .3, done is filled ink with a tick. */
function ListCheck({
  done,
  title,
  onToggle,
}: {
  done: boolean
  title: string
  onToggle?: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${title} done`}
      disabled={!onToggle}
      onClick={onToggle}
      className={[
        'flex size-[15px] flex-none items-center justify-center rounded-[4px] outline-offset-2 focus-visible:outline-[1.5px] focus-visible:outline-mn-text/50 focus-visible:outline-solid',
        done
          ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
          : 'ring-[1.4px] ring-mn-mark-faint ring-inset',
        onToggle ? 'cursor-pointer' : 'cursor-default',
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
          aria-hidden
        >
          <path d="M2 5.2 4.2 7.4 8 2.8" />
        </svg>
      )}
    </button>
  )
}

/** The due cell: right-aligned in 64px; `today` is the one orange pill or a plain word. */
function DueCell({ due, orange }: { due: DueAtom | null; orange: boolean }) {
  return (
    <span
      data-part="list-due"
      className="min-w-[64px] text-right text-[11px] font-medium text-mn-text-meta"
    >
      {due?.kind === 'today' && (orange ? <PondDueToday /> : 'today')}
      {due?.kind === 'date' && due.label}
    </span>
  )
}

export function CollectionList({
  schema,
  rows,
  groupBy,
  editable,
  onEdit,
  onRenameRow,
  onOpenRow,
  today,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
  /** The day the buckets are measured from; read once per mount from the clock when absent. */
  today?: Date
}) {
  const [now] = useState(() => today ?? new Date())
  const grouped = useMemo(
    () => groupRowsByDue(rows, schema, now, groupBy),
    [rows, schema, now, groupBy]
  )
  const { rootRef, selection, selectedRow, select } = useRecordSelection(rows)

  if (!grouped) return <ViewNotice>This list needs a date property.</ViewNotice>
  const { dateDef, done, buckets } = grouped

  const dueOf = (row: CollectionRow) =>
    dueAtom(String(coerceValue(dateDef, row.values[dateDef.id]) ?? ''), now)
  const repeatDef = pickRepeatDef(schema)
  // Burnt orange is the ONE dated thing per screen: only the first open record due
  // today, in the order the list draws them, wears the pill. A finished one never does.
  const orangeTodayId = buckets
    .filter((b) => b.id !== 'done')
    .flatMap((b) => b.rows)
    .find((r) => dueOf(r)?.kind === 'today')?.id
  const selectedBucket = selectedRow
    ? buckets.find((b) => b.rows.some((r) => r.id === selectedRow.id))
    : undefined

  const toggle = (row: CollectionRow, state: DoneState) =>
    onEdit?.(row.id, state.def.id, isRowDone(row, state) ? state.openId : state.doneId)

  return (
    <div ref={rootRef}>
      <div
        data-part="list-card"
        className={[
          'flex flex-col gap-[20px] rounded-[20px] bg-mn-card px-[18px] py-[16px]',
          // The board's card shadow, with the ink recipe for the dark ground.
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
                const rowDone = bucket.id === 'done'
                const isSelected = row.id === selectedRow?.id
                const repeat = repeatDef ? displayValue(repeatDef, row.values[repeatDef.id]) : ''
                const title = row.title || 'Untitled'
                const canToggle = editable && done && onEdit
                return (
                  <li
                    key={row.id}
                    data-part="list-row"
                    data-row-id={row.id}
                    data-done={rowDone || undefined}
                    tabIndex={0}
                    aria-label={title}
                    aria-current={isSelected ? 'true' : undefined}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      select({ id: row.id, via: 'keyboard' })
                    }}
                    onClick={(e) => {
                      if (shouldOpenCardFromClick(e.target)) select({ id: row.id, via: 'pointer' })
                    }}
                    // 6v's row: gap 11, 14px, 8/6 with a -6 margin so the hairline and the
                    // hover wash run past the text, radius 8, a .055 hairline underneath.
                    // A done row steps the whole row down to ink .68.
                    className={[
                      '-mx-[6px] flex cursor-pointer items-center gap-[11px] rounded-[8px] border-b border-mn-text/[0.055] px-[6px] py-[8px] text-[14px]',
                      'outline-[1.5px] outline-offset-1 outline-mn-text/50',
                      isSelected ? 'outline-solid' : 'outline-none focus-visible:outline-solid',
                      rowDone ? 'text-mn-text-secondary' : 'text-mn-text',
                    ].join(' ')}
                  >
                    <ListCheck
                      done={rowDone}
                      title={title}
                      onToggle={canToggle ? () => toggle(row, done) : undefined}
                    />
                    <span className="flex flex-1 flex-wrap items-baseline gap-[10px]">{title}</span>
                    {repeat && (
                      <span
                        data-part="list-repeat"
                        className="inline-flex items-center gap-[4px] text-[11px] font-medium text-mn-text-meta"
                      >
                        <RepeatMark />
                        {repeat}
                      </span>
                    )}
                    <DueCell due={dueOf(row)} orange={!rowDone && row.id === orangeTodayId} />
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
          done={selectedBucket?.id === 'done'}
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
