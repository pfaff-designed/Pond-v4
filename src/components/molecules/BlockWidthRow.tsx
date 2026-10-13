'use client'

/**
 * The block menu's `width` row (6x, `PondMenu.dc.html`'s `widths` map): six
 * cells, ¼ ⅓ ½ ⅔ ¾ full, drawn as the menu's `width` group `content`.
 *
 * Each cell is a `Menu.Item`: Base UI's own roving focus and typeahead inside
 * the menu, but it has no ArrowLeft/ArrowRight handling of its own, so the
 * row owns those keys directly, moving focus and previewing the same as
 * hover.
 *
 * Class strings are template literals, not `cn()` — `PondMenu.tsx`'s same
 * note: tailwind-merge reads an arbitrary text size as a colour and drops one
 * of the two when the cells mix `text-[11px]` with `text-raw-paper`.
 */

import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { Menu } from '@base-ui/react/menu'
import type { BlockWidth } from '@/lib/modules/content'
import type { PondMenuSize } from './PondMenu'

export interface BlockWidthRowProps {
  /** Absent reads as `full` — a block with no width. */
  width: BlockWidth | undefined
  onSelect: (width: BlockWidth) => void
  /** Hovering a non-kept cell previews it; leaving the row clears the preview with `null`. */
  onPreview?: (width: BlockWidth | null) => void
  /** @default 'desktop' */
  size?: PondMenuSize
}

const WIDTHS: { label: string; value: BlockWidth }[] = [
  { label: '¼', value: '1/4' },
  { label: '⅓', value: '1/3' },
  { label: '½', value: '1/2' },
  { label: '⅔', value: '2/3' },
  { label: '¾', value: '3/4' },
  { label: 'full', value: 'full' },
]

const ROW = 'flex gap-[2px] px-[4px] pt-[2px] pb-[4px]'

const CELL =
  'flex min-w-0 cursor-default items-center justify-center font-medium ' +
  'outline-none transition-[background] duration-[var(--motion-quick)] ease-[var(--ease-mn)]'

const CELL_SIZES: Record<PondMenuSize, { cell: string; full: string; fraction: string }> = {
  desktop: { cell: 'h-[30px] rounded-[8px]', full: 'text-[11px]', fraction: 'text-[14px]' },
  mobile: { cell: 'h-[44px] rounded-[12px]', full: 'text-[12px]', fraction: 'text-[17px]' },
}

const CELL_FULL = 'flex-[1.4] font-mono'
const CELL_FRACTION = 'flex-1 font-sans'
const CELL_UNFILLED = 'text-mn-text'
const CELL_FILLED = 'bg-mn-text text-raw-paper dark:text-raw-ink'
const CELL_PREVIEWED = 'bg-mn-hover-fill text-mn-text [box-shadow:inset_0_0_0_1px_var(--mn-rail-field-ring)]'

const NOTE = 'px-[10px] pt-[8px] pb-[4px] font-mono text-[11px] leading-[1.5] text-mn-text-secondary'

/** 6x frame 6: on a phone the note never reflects a preview — there is none to show. */
const PHONE_NOTE = 'widths show on wider screens. on a phone every block is full.'

export const BlockWidthRow = ({ width, onSelect, onPreview, size = 'desktop' }: BlockWidthRowProps) => {
  const current = width ?? 'full'
  const [hovered, setHovered] = useState<BlockWidth | null>(null)
  const hoveredLabel = WIDTHS.find(({ value }) => value === hovered)?.label
  const noteText = size === 'mobile' ? PHONE_NOTE : hoveredLabel && `showing ${hoveredLabel} on the page · click to keep, esc to go back`
  const cellRefs = useRef<(HTMLElement | null)[]>([])
  const rowRef = useRef<HTMLDivElement>(null)

  const handleHover = (value: BlockWidth) => {
    // Hovering the already-kept cell has nothing to preview.
    const previewed = value === current ? null : value
    setHovered(previewed)
    onPreview?.(previewed)
  }

  const handleLeaveRow = () => {
    setHovered(null)
    onPreview?.(null)
  }

  // Base UI's own roving highlight (↓/↑, Tab, typeahead) moves DOM focus
  // directly, bypassing handleArrowKey below — onFocus is the one hook that
  // sees every way a cell can become focused, hover included via click.
  const handleRowBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (rowRef.current?.contains(e.relatedTarget as Node)) return
    handleLeaveRow()
  }

  const handleArrowKey = (index: number) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    // Clamped, no wrap: Base UI's menu has no ArrowLeft/ArrowRight handling of
    // its own to fight here.
    const target = index + (e.key === 'ArrowRight' ? 1 : -1)
    if (target < 0 || target >= WIDTHS.length) return
    e.preventDefault()
    cellRefs.current[target]?.focus()
  }

  return (
    <>
      <div ref={rowRef} className={ROW} onMouseLeave={handleLeaveRow} onBlur={handleRowBlur}>
        {WIDTHS.map(({ label, value }, index) => (
          <Menu.Item
            key={value}
            ref={(el) => {
              cellRefs.current[index] = el
            }}
            label={label}
            onClick={() => onSelect(value)}
            onMouseEnter={() => handleHover(value)}
            onFocus={() => handleHover(value)}
            onKeyDown={handleArrowKey(index)}
            className={`${CELL} ${CELL_SIZES[size].cell} ${
              value === 'full' ? `${CELL_FULL} ${CELL_SIZES[size].full}` : `${CELL_FRACTION} ${CELL_SIZES[size].fraction}`
            } ${value === current ? CELL_FILLED : value === hovered ? CELL_PREVIEWED : CELL_UNFILLED}`}
          >
            {label}
          </Menu.Item>
        ))}
      </div>
      {noteText && <div className={NOTE}>{noteText}</div>}
    </>
  )
}
