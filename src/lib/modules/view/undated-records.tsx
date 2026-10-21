'use client'

/**
 * The undated-record list (KAN-454): a PondPicker glass of the records that
 * have no calendar date, each a mono row with its title and area glyph.
 * Opening the list does not write a date. Picking a row arms placement in the
 * calendar; Escape only closes the list.
 */

import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from 'react'

import { AreaMark } from '@/components/atoms/AreaMark'
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
  onPick,
}: {
  rows: readonly CollectionRow[]
  /** The calendar's record mark (`DAY_ITEM_DOT`), one home for that class. */
  pageMarkClassName: string
  onClose: () => void
  onPick: (row: CollectionRow) => void
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
            onPick={() => onPick(row)}
            mark={
              row.glyph ? <AreaMark glyph={row.glyph} /> : <span className={pageMarkClassName} />
            }
          />
        ))}
      </div>
    </div>
  )
}
