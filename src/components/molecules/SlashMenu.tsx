'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface SlashMenuItem {
  id: string
  name: string
  description: string
}

export interface SlashMenuProps {
  items: SlashMenuItem[]
  onSelect: (item: SlashMenuItem) => void
  onClose: () => void
  /** Additional className for the panel — use for positioning (e.g. 'absolute bottom-full left-0 mb-1') */
  className?: string
  /**
   * When set, the panel renders in a portal on `document.body` at a FIXED
   * position just below the anchor — escaping every parent stacking context
   * (the areas overview grid, the terminal region) so an open palette always
   * floats above page content. Without it the panel positions inline via
   * `className` (the chat command menu, which lives at the top of its own
   * stack, uses that path).
   */
  anchorEl?: HTMLElement | null
}

export function SlashMenu({ items, onSelect, onClose, className, anchorEl }: SlashMenuProps) {
  const [filter, setFilter] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const filteredItems = filter
    ? items.filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()))
    : items

  // Clamp activeIndex to valid range when filteredItems changes
  const clampedIndex = Math.min(activeIndex, Math.max(0, filteredItems.length - 1))

  // Portal positioning: fixed coords just below the anchor, tracked across
  // scroll/resize so the floating panel stays put.
  const [fixedPos, setFixedPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchorEl) return
    const update = () => {
      const r = anchorEl.getBoundingClientRect()
      setFixedPos({ top: r.bottom + 4, left: r.left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorEl])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Dismiss on any pointer-down outside the panel (ticket: the palette must be
  // escapable without picking). Capture phase so it beats inner handlers; the
  // opening `/` keystroke isn't a pointer event, so this never self-closes on open.
  useEffect(() => {
    function onPointerDownOutside(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDownOutside, true)
    return () => document.removeEventListener('pointerdown', onPointerDownOutside, true)
  }, [onClose])

  // Scroll active item into view
  useEffect(() => {
    const container = itemsRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [clampedIndex, filteredItems.length])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filteredItems[clampedIndex]
      if (selected) onSelect(selected)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Backspace' && filter === '') {
      // Backspace on an empty filter dismisses the palette (the `/` gesture in
      // reverse) instead of doing nothing. stopPropagation so it doesn't also
      // bubble to the host block's own backspace-to-delete.
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        // ticket-41: the palette grows from its anchor (quick), rather than
        // rising like a page surface — it reads as summoned in place. The
        // caller positions it; transform-origin follows via --motion-menu-origin
        // when the anchor isn't top-left.
        // MN PondPicker: the picker is a card-level floating surface — outer
        // radius 20 (rounded-mn-card), separated by shadow not a hard frame
        // ("paper-not-frames"), with the sans-row list inset by p-1 padding.
        'motion-menu bg-mn-surface rounded-mn-card shadow-mn-lg overflow-hidden',
        // Portal mode owns its own fixed box (w-72, high z); inline mode takes
        // the caller's positioning className.
        anchorEl ? 'fixed z-[100] w-72' : className
      )}
      style={anchorEl && fixedPos ? { top: fixedPos.top, left: fixedPos.left } : undefined}
      role="menu"
      aria-label="Block picker"
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
        placeholder="filter…"
        className="w-full border-b border-mn-hair bg-transparent font-mono lowercase tracking-wider text-sm px-3 pt-2.5 pb-3 outline-none placeholder:text-mn-text-faint"
        aria-label="Filter blocks"
      />
      <div ref={itemsRef} className="overflow-y-auto max-h-64 p-1.5 flex flex-col gap-0.5">
        {filteredItems.length === 0 ? (
          // MN note voice: machine-surface message is mono lowercase, muted tier.
          <p className="px-3 py-2 font-mono lowercase tracking-wider text-xs text-mn-text-secondary">No blocks match</p>
        ) : (
          filteredItems.map((item, i) => {
            const isActive = i === clampedIndex
            return (
              <button
                key={item.id}
                className={cn(
                  // MN sans-row voice: rounded-mn-inner (14) rows, sans UI type
                  // for name + description, accent-wash on the active/hover row.
                  'w-full text-left rounded-mn-inner px-3 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-mn-text',
                  isActive ? 'bg-mn-selected-fill' : 'hover:bg-mn-wash'
                )}
                data-active={isActive ? 'true' : undefined}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(item)}
              >
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-xs text-mn-text-secondary mt-0.5">{item.description}</div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  // Portal the panel to document.body so it escapes the overview grid + terminal
  // stacking contexts; inline callers (chat command menu) render in place.
  if (anchorEl && typeof document !== 'undefined') {
    return createPortal(panel, document.body)
  }
  return panel
}
