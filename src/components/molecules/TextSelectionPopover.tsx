'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export interface SelectionContext {
  /** The selected text. */
  text: string
  /** The id of the block the selection is within, if determinable. */
  blockId?: string
}

export interface TextSelectionPopoverProps {
  /** The container within which selections are watched. Defaults to document. */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Called when the user clicks "Ask Pond" with the selected context. */
  onAsk: (ctx: SelectionContext) => void
  /** While true (e.g. during streaming), the popover is suppressed. */
  disabled?: boolean
}

interface PopoverPos {
  x: number
  y: number
}

/** Quiet floating "Ask Pond" popover that appears on text selection. */
export function TextSelectionPopover({ containerRef, onAsk, disabled }: TextSelectionPopoverProps) {
  const [pos, setPos] = useState<PopoverPos | null>(null)
  const [ctx, setCtx] = useState<SelectionContext | null>(null)
  const popoverRef = useRef<HTMLButtonElement>(null)

  const hide = useCallback(() => {
    setPos(null)
    setCtx(null)
  }, [])

  useEffect(() => {
    function onSelectionChange() {
      if (disabled) return

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hide()
        return
      }

      const text = sel.toString().trim()
      if (!text) {
        hide()
        return
      }

      // Only show when selection is inside the container (if supplied).
      if (containerRef?.current) {
        const range = sel.getRangeAt(0)
        if (!containerRef.current.contains(range.commonAncestorContainer)) {
          hide()
          return
        }
      }

      // Resolve blockId from nearest ancestor with data-block-id attribute.
      const anchor = sel.anchorNode
      const blockEl =
        anchor instanceof Element
          ? anchor.closest('[data-block-id]')
          : anchor?.parentElement?.closest('[data-block-id]')
      const blockId = blockEl?.getAttribute('data-block-id') ?? undefined

      // Position the popover above the selection's bounding box.
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        hide()
        return
      }

      setCtx({ text, blockId })
      setPos({
        x: rect.left + rect.width / 2,
        y: rect.top + window.scrollY,
      })
    }

    // selectionchange fires on every selection update; mouseup catches the end
    // of a drag-select where the selection may already be stable.
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [containerRef, disabled, hide])

  // Hide when the user clicks elsewhere (not on the popover itself).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) return
      hide()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [hide])

  if (!pos || !ctx) return null

  return (
    <button
      ref={popoverRef}
      aria-label="Ask Pond about selection"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onAsk(ctx)
        hide()
        // Clear the browser selection so the quote chip in the composer is the only remnant.
        window.getSelection()?.removeAllRanges()
      }}
      className="fixed z-50 mn-arrive"
      style={{ left: pos.x, top: pos.y - 36, transform: 'translateX(-50%)' }}
    >
      <span
        className="
          rounded-mn-pill bg-mn-surface
          px-3 py-1 text-xs font-mono lowercase text-mn-text-secondary
          shadow-mn-md ring-1 ring-mn-line hover:text-mn-text hover:ring-mn-text
          transition-colors select-none whitespace-nowrap
        "
      >
        ask pond
      </span>
    </button>
  )
}
