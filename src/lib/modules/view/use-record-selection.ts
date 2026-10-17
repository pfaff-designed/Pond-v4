'use client'

/**
 * Which record a view has selected, and everything that selects or dismisses it
 * (`Pond 06.21` 6u.2). Shared by the board's cards and the list's rows.
 *
 * `via` records how a record was chosen: a keyboard open moves focus into the peek, a
 * pointer one leaves it where the person is. Selection is derived against `rows`, so a
 * record that is deleted or filtered away closes its own peek.
 *
 * On a page canvas only one view holds a peek at a time: selecting here releases the
 * peek of any other view, and only a press on the canvas's own paper dismisses it.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { usePageCanvas } from '../page-canvas'
import { shouldSelectCardFromClick } from './card-click'

export type RecordSelection = { id: string; via: 'pointer' | 'keyboard' }

// A press on any of these belongs to the view or its peek, not to empty paper.
const KEEPS_SELECTION =
  '[data-row-id], [data-part="record-peek"], [role="dialog"], [role="listbox"], [role="menu"]'

export function useRecordSelection<T extends { id: string }>(
  rows: readonly T[],
  viewKey: string,
  options: { isClickSuppressed?: () => boolean } = {}
) {
  const canvas = usePageCanvas()
  const activePeek = canvas?.activePeek
  const setActivePeek = canvas?.setActivePeek
  const [selection, setSelection] = useState<RecordSelection | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const ownsPeek = !canvas || activePeek === viewKey
  const selectedRow = selection && ownsPeek ? rows.find((r) => r.id === selection.id) : undefined
  const selectedId = selectedRow?.id

  const select = (next: RecordSelection | null) => {
    setSelection(next)
    setActivePeek?.((current) => (next ? viewKey : current === viewKey ? null : current))
  }

  const canvasElement = canvas?.element
  useEffect(() => {
    if (!selectedId) return
    const handleClose = () => {
      const peek = document.querySelector('[data-part="record-peek"]')
      const focusInPeek = !!peek?.contains(document.activeElement)
      setSelection(null)
      setActivePeek?.((current) => (current === viewKey ? null : current))
      if (focusInPeek) {
        document.querySelector<HTMLElement>(`[data-row-focus="${selectedId}"]`)?.focus()
      }
    }
    // An esc this takes is marked taken, so nothing further out (zen) acts on it too.
    const handleKeyDown = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      handleClose()
    }
    const handlePointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest(KEEPS_SELECTION)) return
      handleClose()
    }
    const paper: HTMLElement | Document = canvasElement ?? document
    document.addEventListener('keydown', handleKeyDown)
    paper.addEventListener('pointerdown', handlePointerDown as EventListener)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      paper.removeEventListener('pointerdown', handlePointerDown as EventListener)
    }
  }, [selectedId, canvasElement, setActivePeek, viewKey])

  const selectWithPointer = (id: string) => {
    if (options.isClickSuppressed?.()) return
    select({ id, via: 'pointer' })
  }

  return {
    rootRef,
    selection: selectedRow ? selection : null,
    selectedRow,
    select,
    selectWithPointer,
    /** The record's container: marks it and selects on a click that is not a control's. */
    rowProps: (id: string) => ({
      'data-row-id': id,
      onClick: (e: MouseEvent) => {
        if (shouldSelectCardFromClick(e.target)) selectWithPointer(id)
      },
    }),
    /** For a container that is its own tab stop (a card): Enter or Space on it selects. */
    keyboardProps: (id: string) => ({
      tabIndex: 0,
      'data-row-focus': id,
      'aria-current': id === selectedId ? ('true' as const) : undefined,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        select({ id, via: 'keyboard' })
      },
    }),
    /** The one home for "first ↵/Space selects; ↵ on the already-selected row opens
     *  its page" — `CollectionTable`'s row, `CollectionGallery`'s card and the
     *  calendar's stack item/focus-list row all split a row's own Enter/Space this
     *  way. A click's own select-vs-open split differs per view, so it stays there. */
    selectOrOpenOnKey: (
      id: string,
      e: KeyboardEvent,
      onOpenRow?: (id: string) => void
    ) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      if (e.key === 'Enter' && id === selectedId) {
        onOpenRow?.(id)
        return
      }
      select({ id, via: 'keyboard' })
    },
    /** For a native button inside the record: it is the tab stop, and activates natively. */
    buttonProps: (id: string) => ({
      'data-row-focus': id,
      'aria-current': id === selectedId ? ('true' as const) : undefined,
      onClick: (e: MouseEvent) => select({ id, via: e.detail === 0 ? 'keyboard' : 'pointer' }),
    }),
  }
}
