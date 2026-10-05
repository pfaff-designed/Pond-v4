'use client'

/**
 * Which record a view has selected, and the dismissals that go with it (`Pond 06.21`
 * 6u.2): Esc, or a press on empty paper, closes the peek. Shared by the board's cards
 * and the list's rows — both mark themselves with `data-row-id`.
 *
 * `via` records how it was chosen: a keyboard open moves focus into the peek, a
 * pointer one leaves it where the person is. Selection is derived against `rows`, so a
 * record that is deleted or filtered away closes its own peek.
 */

import { useEffect, useRef, useState } from 'react'

export type RecordSelection = { id: string; via: 'pointer' | 'keyboard' }

// A press on any of these is the view's own business, not a press on empty paper.
const KEEPS_SELECTION =
  '[data-row-id], [data-part="record-peek"], [role="dialog"], [role="listbox"], [role="menu"]'

export function useRecordSelection<T extends { id: string }>(rows: readonly T[]) {
  const [selection, setSelection] = useState<RecordSelection | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedRow = selection ? rows.find((r) => r.id === selection.id) : undefined

  const selectedId = selectedRow?.id
  useEffect(() => {
    if (!selectedId) return
    const close = () => {
      const peek = rootRef.current?.querySelector('[data-part="record-peek"]')
      const focusInPeek = !!peek?.contains(document.activeElement)
      setSelection(null)
      if (focusInPeek) {
        rootRef.current?.querySelector<HTMLElement>(`[data-row-id="${selectedId}"]`)?.focus()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const handlePointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return
      if (e.target.closest(KEEPS_SELECTION)) return
      setSelection(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [selectedId])

  return { rootRef, selection, selectedRow, select: setSelection }
}
