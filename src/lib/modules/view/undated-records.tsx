'use client'

/**
 * The undated-record list (KAN-454): a PondPicker glass of the records that
 * have no calendar date. `CollectionRow` is id, title, and values — no area
 * glyph — so each row leads with the calendar's own record mark. Opening the
 * list does not write a date; Escape only closes it.
 */

import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from 'react'

import { GLASS, LIST, SLASH_SIZES } from '@/components/molecules/picker-chrome'
import { Row, type RowEntry } from '@/components/molecules/slash-row'

import type { CollectionRow } from './apply'

const handleRowIdle = () => undefined

const rowEntry = (row: CollectionRow): RowEntry => ({
  kind: 'row',
  id: row.id,
  label: row.title,
  pre: row.title,
  hit: '',
  post: '',
})

export function UndatedRecords({
  rows,
  pageMarkClassName,
  onClose,
}: {
  rows: readonly CollectionRow[]
  /** The calendar's record mark (`DAY_ITEM_DOT`), one home for that class. */
  pageMarkClassName: string
  onClose: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <div data-part="glass" className={`${GLASS} ${SLASH_SIZES.desktop.width}`}>
      <div role="listbox" aria-label="without a date" className={LIST} onKeyDown={handleKeyDown}>
        {rows.map((row) => (
          <Row
            key={row.id}
            entry={rowEntry(row)}
            selected={false}
            onHover={handleRowIdle}
            onPick={handleRowIdle}
            mark={<span className={pageMarkClassName} />}
          />
        ))}
      </div>
    </div>
  )
}
