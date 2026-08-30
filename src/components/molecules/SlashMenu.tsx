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
      onClose()
    }
  }

  const panel = (
    <div
      className={cn(
        // ticket-41: the palette grows from its anchor (quick), rather than
        // rising like a page surface — it reads as summoned in place. The
        // caller positions it; transform-origin follows via --motion-menu-origin
        // when the anchor isn't top-left.
        'motion-menu bg-press-paper border border-press-line rounded-lg shadow-xl overflow-hidden',
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
        placeholder="Filter…"
        className="w-full border-b border-press-hair bg-transparent font-mono text-sm px-3 py-2 outline-none"
        aria-label="Filter blocks"
      />
      <div ref={itemsRef} className="overflow-y-auto max-h-64">
        {filteredItems.length === 0 ? (
          <p className="px-3 py-2 text-sm italic text-press-muted">No blocks match</p>
        ) : (
          filteredItems.map((item, i) => {
            const isActive = i === clampedIndex
            return (
              <button
                key={item.id}
                className={cn(
                  'w-full text-left px-3 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-press-accent',
                  isActive ? 'bg-press-accent-wash' : 'hover:bg-press-accent-wash'
                )}
                data-active={isActive ? 'true' : undefined}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(item)}
              >
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-xs text-press-muted mt-0.5">{item.description}</div>
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
