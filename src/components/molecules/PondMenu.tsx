'use client'

/**
 * PondMenu — the glass menus of `PondMenu.dc.html`. Built: kind `block`, the
 * menu a block's handle (or ⌘/ on a focused block) opens.
 *
 * Every literal is the DC's `renderVals()`, written as given:
 *
 *   box    260 wide (350 phone) · border-box · column · gap 1 · padding 6 · radius 16
 *          · PP Neue Montreal · ink
 *          paper: linear-gradient(160deg, white .92 → .76) · border 1px white .9
 *                 · inset 0 1px 0 white .7, 0 20px 54px rgba(40,34,24,.16)
 *          ink:   linear-gradient(160deg, rgba(74,73,64,.96) → .86) · border 1px paper .09
 *                 · 0 20px 54px black .45
 *          both:  blur(24px) saturate(1.3)
 *   head   6px 10px 4px · 10.5 · 500 · .1em · uppercase · ink 68
 *   item   flex · centre · gap 9 · 7px 10px · radius 10 · 13 · active ink .07
 *          phone: min-height 44 · 0 12px · 15
 *   value  mono 10.5 · ink 68
 *   rule   1px · margin 4px 8px · ink .09
 *
 * A group is a head (when it has one) and its items; a rule sits between two
 * groups that have items, and a group with none is not drawn at all.
 *
 * Keyboard: focus moves onto the items (↑/↓, Home/End), Enter or Space picks,
 * Escape or Tab closes. Closing from the keyboard, or picking, hands focus back
 * to the anchor that opened the menu. A pointer-down outside closes it; one on
 * the anchor is left to the anchor, whose own click toggles.
 *
 * Class strings are template literals, not `cn()` (#252: tailwind-merge drops a
 * size it takes for a colour).
 */

import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

export const POND_MENU_KINDS = ['block'] as const
export type PondMenuKind = (typeof POND_MENU_KINDS)[number]
export type PondMenuSize = 'desktop' | 'mobile'

export interface PondMenuItem {
  id: string
  /** Lowercase, as the DC writes it: "table", "copy link to block". */
  label: string
  /** The mono value at the item's right, e.g. "3 rows · 2 columns". */
  value?: string
}

export interface PondMenuGroup {
  id: string
  /** The group's name — drawn as its head when `heading`, otherwise only announced. */
  label: string
  heading?: boolean
  items: PondMenuItem[]
}

export interface PondMenuProps {
  kind: PondMenuKind
  /** The menu's accessible name, e.g. "block menu". */
  label: string
  groups: PondMenuGroup[]
  /** @default 'desktop' */
  size?: PondMenuSize
  onSelect: (id: string) => void
  onClose: () => void
  /** What opened the menu: it gets focus back on close, and its own pointer-down never closes. */
  anchorRef?: RefObject<HTMLElement | null>
  /** Placement, from the host. */
  className?: string
}

const GLASS =
  'border border-[rgba(255,255,255,.9)] ' +
  'bg-[linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.76))] ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.16)] ' +
  'backdrop-blur-[24px] backdrop-saturate-[1.3] ' +
  'dark:border-[rgba(250,249,239,.09)] ' +
  'dark:bg-[linear-gradient(160deg,rgba(74,73,64,.96),rgba(74,73,64,.86))] ' +
  'dark:shadow-[0_20px_54px_rgba(0,0,0,.45)]'

const BOX = `motion-menu box-border flex flex-col gap-[1px] p-[6px] rounded-[16px] font-sans leading-[normal] text-mn-text outline-none ${GLASS}`

const HEAD =
  'px-[10px] pt-[6px] pb-[4px] text-[10.5px] font-medium tracking-[.1em] uppercase text-mn-text-secondary'

const ITEM_BASE =
  'flex w-full cursor-default items-center gap-[9px] rounded-[10px] text-left outline-none transition-colors data-[active=true]:bg-mn-hover-fill'

const VALUE = 'font-mono text-[10.5px] text-mn-text-secondary'

const RULE = 'h-px flex-none mx-[8px] my-[4px] bg-mn-text/[0.09]'

const SIZES: Record<PondMenuKind, Record<PondMenuSize, { width: string; item: string }>> = {
  block: {
    desktop: { width: 'w-[260px]', item: `${ITEM_BASE} px-[10px] py-[7px] text-[13px]` },
    mobile: { width: 'w-[350px]', item: `${ITEM_BASE} min-h-[44px] px-[12px] text-[15px]` },
  },
}

export const PondMenu = ({
  kind,
  label,
  groups,
  size = 'desktop',
  onSelect,
  onClose,
  anchorRef,
  className = '',
}: PondMenuProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const headId = useId()
  const drawn = groups.filter((group) => group.items.length > 0)
  const ordered = drawn.flatMap((group) => group.items)
  const { width, item: itemClass } = SIZES[kind][size]

  const focusItem = (index: number) => {
    setActiveIndex(index)
    itemRefs.current[index]?.focus()
  }

  // Focus lands on the first item at once, so the keys work the moment it opens.
  useEffect(() => {
    itemRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDownOutside, true)
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside, true)
  }, [onClose, anchorRef])

  const handleClose = () => {
    anchorRef?.current?.focus()
    onClose()
  }

  const handlePick = (id: string) => {
    anchorRef?.current?.focus()
    onSelect(id)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // The menu owns the keyboard while it has focus: a key must not reach the
    // block underneath (Backspace there deletes an empty block).
    e.stopPropagation()
    const last = ordered.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(activeIndex + 1, last),
      ArrowUp: Math.max(activeIndex - 1, 0),
      Home: 0,
      End: last,
    }
    if (e.key in moves) {
      e.preventDefault()
      focusItem(moves[e.key])
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const active = ordered[activeIndex]
      if (active) handlePick(active.id)
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      handleClose()
    }
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      data-kind={kind}
      data-size={size}
      onKeyDown={handleKeyDown}
      className={`${BOX} ${width} ${className}`}
    >
      {drawn.map((group, groupIndex) => {
        const groupHeadId = `${headId}-${group.id}`
        return (
          <Fragment key={group.id}>
            {groupIndex > 0 && <div role="separator" className={RULE} />}
            <div
              role="group"
              {...(group.heading
                ? { 'aria-labelledby': groupHeadId }
                : { 'aria-label': group.label })}
              className="flex flex-col gap-[1px]"
            >
              {group.heading && (
                <div id={groupHeadId} className={HEAD}>
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const index = ordered.indexOf(item)
                const isActive = index === activeIndex
                return (
                  <button
                    key={item.id}
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={isActive ? 0 : -1}
                    data-active={isActive ? 'true' : undefined}
                    onMouseEnter={() => focusItem(index)}
                    onClick={() => handlePick(item.id)}
                    className={itemClass}
                  >
                    <span className="flex-1">{item.label}</span>
                    {item.value && <span className={VALUE}>{item.value}</span>}
                  </button>
                )
              })}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
