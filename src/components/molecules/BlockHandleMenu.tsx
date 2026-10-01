'use client'

/**
 * The block handle menu (#101; `Pond 06.10` board 6j frame 2): clicking a block's
 * handle opens this menu, "the / menu's vocabulary, applied to a block that
 * already exists". Two groups — `turn into` (the conversions that keep the
 * content; today: a list → table, with the row's preview "4 rows · 3 columns")
 * and `block` (the block's own actions). Items are supplied by the host
 * (BlockCanvas) so the menu knows nothing about what a block is.
 *
 * Measured off the frame: a 250px floating glass card (radius 20, the glass
 * recipe), 8px padding, 1px row gap; group label mono 10.5 / .04em at the
 * secondary tier; rows mono 12.5 / .01em, radius 10, 7×10 padding, the hover fill
 * on the active row, a 13px hand-drawn icon at the meta tier, the preview at 10.5
 * secondary, and the ↵ hint on the active row. Machine surface: mono, lowercase.
 *
 * Purely presentational + keyboard: ↑/↓ move, Enter/Space pick, Escape closes;
 * a pointer-down outside the panel (and off the anchor, which toggles) closes.
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type BlockMenuGroup = 'turn into' | 'block'
export type BlockMenuIcon = 'table' | 'delete'

export interface BlockMenuItem {
  id: string
  group: BlockMenuGroup
  /** Pond's lowercase register: "table", "delete block". */
  label: string
  /** What will come out, e.g. "4 rows · 3 columns" (frame 2's preview count). */
  preview?: string
  icon?: BlockMenuIcon
}

export interface BlockHandleMenuProps {
  items: BlockMenuItem[]
  onSelect: (id: string) => void
  onClose: () => void
  /** The handle that opened the menu — a pointer-down on it toggles rather than closes. */
  anchorRef?: React.RefObject<HTMLElement | null>
  /** Positioning className (the host anchors it under the handle). */
  className?: string
}

const GROUP_ORDER: readonly BlockMenuGroup[] = ['turn into', 'block']

/** Hand-drawn functional marks: 13px, stroke 1.4, round caps (PROJECT_RULES icons). */
function MenuIcon({ icon }: { icon: BlockMenuIcon }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'flex-none',
  }
  if (icon === 'table') {
    return (
      <svg {...common}>
        <rect x="2" y="2.5" width="10" height="9" rx="1.2" />
        <path d="M2 6h10M6 2.5v9" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 4l6 6M10 4l-6 6" />
    </svg>
  )
}

export function BlockHandleMenu({
  items,
  onSelect,
  onClose,
  anchorRef,
  className,
}: BlockHandleMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // Items in display order (grouped), so the active index and the arrow keys walk
  // the menu exactly as drawn.
  const ordered = GROUP_ORDER.flatMap((group) => items.filter((item) => item.group === group))
  const clamped = Math.min(activeIndex, Math.max(0, ordered.length - 1))

  // Take focus so the arrow keys and Escape work at once; the handle keeps its
  // place in the tab order for when the menu closes.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Dismiss on a pointer-down outside the panel. The anchor is excluded: its own
  // click toggles the menu, and closing on its pointer-down would reopen it.
  useEffect(() => {
    function onPointerDownOutside(e: PointerEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDownOutside, true)
    return () => document.removeEventListener('pointerdown', onPointerDownOutside, true)
  }, [onClose, anchorRef])

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, ordered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const item = ordered[clamped]
      if (item) onSelect(item.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Block menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn(
        'motion-menu mn-glass rounded-mn-card flex w-[250px] flex-col gap-px p-2 font-mono lowercase text-mn-text outline-none',
        className
      )}
    >
      {GROUP_ORDER.map((group) => {
        const inGroup = items.filter((item) => item.group === group)
        if (inGroup.length === 0) return null
        return (
          <Fragment key={group}>
            <div
              role="presentation"
              className="px-2.5 pt-2 pb-[5px] text-[10.5px] tracking-[0.04em] text-mn-text-secondary"
            >
              {group}
            </div>
            {inGroup.map((item) => {
              const i = ordered.indexOf(item)
              const isActive = i === clamped
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  data-active={isActive ? 'true' : undefined}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-mn-row px-2.5 py-[7px] text-left text-[12.5px] tracking-[0.01em] outline-none transition-colors',
                    isActive ? 'bg-mn-hover-fill' : 'hover:bg-mn-hover-fill'
                  )}
                >
                  {item.icon && (
                    <span className="flex text-mn-text-meta">
                      <MenuIcon icon={item.icon} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.preview && (
                    <span className="min-w-0 max-w-[45%] truncate text-[10.5px] text-mn-text-secondary">
                      {item.preview}
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[10.5px] text-mn-text-meta" aria-hidden>
                      ↵
                    </span>
                  )}
                </button>
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
