'use client'

/**
 * The block menu's `width` row (6x, `PondMenu.dc.html`'s `widths` map): six
 * cells, ¼ ⅓ ½ ⅔ ¾ full, drawn as the menu's `width` group `content`.
 *
 * Each cell is a `Menu.Item`: Base UI's own roving focus and typeahead inside
 * the menu, no handler of our own (KAN-246 owns ← → and the hover/arrow
 * preview this row does not draw).
 *
 * Class strings are template literals, not `cn()` — `PondMenu.tsx`'s same
 * note: tailwind-merge reads an arbitrary text size as a colour and drops one
 * of the two when the cells mix `text-[11px]` with `text-raw-paper`.
 */

import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import type { BlockWidth } from '@/lib/modules/content'

export interface BlockWidthRowProps {
  /** Absent reads as `full` — a block with no width. */
  width: BlockWidth | undefined
  onSelect: (width: BlockWidth) => void
  /** Hovering a non-kept cell previews it; leaving the row clears the preview with `null`. */
  onPreview?: (width: BlockWidth | null) => void
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
  'flex h-[30px] min-w-0 cursor-default items-center justify-center rounded-[8px] font-medium ' +
  'outline-none transition-[background] duration-[var(--motion-quick)] ease-[var(--ease-mn)]'

const CELL_FULL = 'flex-[1.4] font-mono text-[11px]'
const CELL_FRACTION = 'flex-1 font-sans text-[14px]'
const CELL_UNFILLED = 'text-mn-text'
const CELL_FILLED = 'bg-mn-text text-raw-paper dark:text-raw-ink'
const CELL_PREVIEWED = 'bg-mn-hover-fill text-mn-text [box-shadow:inset_0_0_0_1px_var(--mn-rail-field-ring)]'

export const BlockWidthRow = ({ width, onSelect, onPreview }: BlockWidthRowProps) => {
  const current = width ?? 'full'
  const [hovered, setHovered] = useState<BlockWidth | null>(null)

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

  return (
    <div className={ROW} onMouseLeave={handleLeaveRow}>
      {WIDTHS.map(({ label, value }) => (
        <Menu.Item
          key={value}
          label={label}
          onClick={() => onSelect(value)}
          onMouseEnter={() => handleHover(value)}
          className={`${CELL} ${value === 'full' ? CELL_FULL : CELL_FRACTION} ${
            value === current ? CELL_FILLED : value === hovered ? CELL_PREVIEWED : CELL_UNFILLED
          }`}
        >
          {label}
        </Menu.Item>
      ))}
    </div>
  )
}
