'use client'

/**
 * List view (`Pond 06.21` 6v): the collection's records as a checklist. One card —
 * radius 20, padding 16/18, the 2u card shadow, gap 20 between groups — with a group
 * label over each run of rows. A select or status `groupBy` draws `groupRows` even
 * when `listFlat` is also set (one heading per option in schema order, then
 * `No ${field name}`, empty options included), so the head and the body cannot
 * disagree. `listFlat === true` with no select or status `groupBy` draws one flat
 * run of those same rows: no headings and no due buckets, including when a date
 * field would have bucketed them and when the schema has no date. Otherwise a date
 * `groupBy`, or none, still draws `groupRowsByDue`. Same rows as every other view.
 *
 * A row's title is its tab stop: click, Enter or Space selects the record and opens
 * its peek (6u.2), exactly as a board card does. The checkbox is the person's own
 * edit — it writes the record's `done` status through `onEdit`.
 *
 * No date property on the collection (KAN-292) → `CALENDAR_EMPTY_LINE` draws in
 * `PondBlockEmpty`'s emptyBox with the `add a date field` remedy, but only when
 * `onAddDateField` is wired — a read-only render keeps the bare line instead, no
 * button to offer. True whether or not the collection already holds records
 * (unlike `LIST_EMPTY_LINE`, which means zero rows). `listFlat === true` does not
 * take that path: the rows draw flat, or the list's own empty line when there are none.
 */

import { useMemo, useState } from 'react'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import { type PropertySchema, type PropertyValue } from '@/lib/properties/schema'
import { useOrangeToday } from '../page-canvas'
import { AddRowInput } from './add-row-input'
import { displayValue, groupRows, pickDateDef, pickRepeatDef, type CollectionRow } from './apply'
import { RepeatMark } from './cells'
import { dueOfRow, firstOrangeToday } from './due'
import { DueMark } from './due-mark'
import { groupRowsByDue } from './due-buckets'
import { CALENDAR_EMPTY_LINE } from './kinds'
import { RecordCheck } from './record-check'
import { RecordPeek } from './record-peek'
import { useDoneToggle } from './use-done-toggle'
import { ROW_FOCUS_VISIBLE_BASE, useRecordSelection } from './use-record-selection'

export const LIST_EMPTY_LINE = 'no records yet'

/** One drawn run. `showCount` is the select/status heading; a due bucket leaves it off. */
type ListSection = {
  key: string
  label: string
  rows: CollectionRow[]
  showCount: boolean
  /** Absent shows the heading. `false` is the flat run, whose label is unused. */
  showHeading?: boolean
}

export function CollectionList({
  viewKey,
  schema,
  rows,
  groupBy,
  listFlat,
  editable,
  onEdit,
  onAddRow,
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
  /** Only `true` skips due buckets. A select or status `groupBy` still wins. */
  listFlat?: boolean
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
  /** KAN-292: mint a `date` field onto this collection's schema, offered when it
   *  has none to group by. Absent when not editable — no undrawn affordance. */
  onAddDateField?: () => void
  /** The day the groups are measured from; read once per mount from the clock when absent. */
  today?: Date
}) {
  const [now] = useState(() => today ?? new Date())
  const [addingRow, setAddingRow] = useState(false)
  const sections = useMemo((): ListSection[] | null => {
    const byField = groupRows(rows, schema, groupBy)
    if (byField) {
      return byField.groups.map((group) => ({
        key: group.id ?? group.label,
        label: group.label,
        rows: group.rows,
        showCount: true,
      }))
    }
    if (listFlat === true) {
      return rows.length === 0 ? [] : [{ key: 'flat', label: '', rows, showCount: false, showHeading: false }]
    }
    const byDue = groupRowsByDue(rows, schema, now, groupBy)
    if (!byDue) return null
    return byDue.buckets.map((bucket) => ({
      key: bucket.id,
      label: bucket.id,
      rows: bucket.rows,
      showCount: false,
    }))
  }, [rows, schema, now, groupBy, listFlat])
  const { rootRef, selection, selectedRow, rowProps, buttonProps } = useRecordSelection(
    rows,
    viewKey
  )
  // The heading is not the tick. A date groupBy already resolved the done status
  // on its own; a select or status heading must do the same, or the check is
  // inert or writes that heading and the row jumps.
  const done = useDoneToggle({ schema, editable, onEdit })
  const dueOf = dueOfRow(pickDateDef(schema, groupBy), now)
  const orangeTodayId = useOrangeToday(
    viewKey,
    rootRef,
    firstOrangeToday(
      (sections ?? []).flatMap((section) => section.rows),
      dueOf,
      done.isDone
    )
  )

  if (!sections) {
    return onAddDateField ? (
      <PondBlockEmpty line={CALENDAR_EMPTY_LINE} action="add a date field" onAction={onAddDateField} />
    ) : (
      <span className="text-[14px] text-mn-text-secondary">{CALENDAR_EMPTY_LINE}</span>
    )
  }
  const repeatDef = pickRepeatDef(schema)

  // ↵ with a title mints one record (addRow, then onRenameRow) in a single
  // pause — one change-log record, same as every other mode's add (session
  // undo for row adds is KAN-419). Closing the input afterward is
  // `AddRowInput`'s own job (its `staysOpen` branch), not ours.
  const handleAddItem = async (title: string) => {
    try {
      const id = await onAddRow?.()
      if (id) onRenameRow?.(id, title)
    } catch (err) {
      console.error('Failed to add an item', err)
    }
  }

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
        {sections.length === 0 && !(editable && onAddRow) && (
          <span className="text-[14px] text-mn-text-secondary">{LIST_EMPTY_LINE}</span>
        )}
        {sections.map((section) => (
          <section
            key={section.key}
            data-part={section.showHeading === false ? undefined : 'list-group'}
            data-group={section.showHeading === false ? undefined : section.label}
            aria-label={section.showHeading === false ? undefined : section.label}
            className="flex flex-col"
          >
            {section.showHeading !== false &&
              (section.showCount ? (
                <div
                  data-part="list-group-label"
                  aria-hidden
                  className="flex justify-between pb-[4px] text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
                >
                  <span>{section.label}</span>
                  <span data-part="list-group-count">{section.rows.length}</span>
                </div>
              ) : (
                <span
                  data-part="list-group-label"
                  aria-hidden
                  className="pb-[4px] text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
                >
                  {section.label}
                </span>
              ))}
            <ul className="m-0 flex list-none flex-col p-0">
              {section.rows.map((row) => {
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
                      ROW_FOCUS_VISIBLE_BASE,
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
        {editable &&
          onAddRow &&
          (addingRow ? (
            <AddRowInput
              key="list-add-row-input"
              aria-label="Add an item"
              placeholder="Untitled"
              autoFocus
              staysOpen
              onCommit={(title) => void handleAddItem(title)}
              onCancel={() => setAddingRow(false)}
              className={
                sections.length === 0
                  ? 'w-full border-0 bg-transparent p-0 text-[14px] text-mn-text outline-none placeholder:text-mn-text-secondary'
                  : '-mx-[6px] w-full border-0 bg-transparent px-[6px] py-[8px] text-[14px] text-mn-text outline-none placeholder:text-mn-text-secondary'
              }
            />
          ) : sections.length === 0 ? (
            <PondBlockEmpty kind="list" onAction={() => setAddingRow(true)} />
          ) : (
            <button
              type="button"
              data-part="list-add"
              onClick={() => setAddingRow(true)}
              className="-mx-[6px] rounded-[8px] px-[6px] py-[8px] text-left text-[14px] text-mn-text-secondary transition-colors hover:bg-mn-text/[0.04] hover:text-mn-text motion-reduce:transition-none"
            >
              add an item
            </button>
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
