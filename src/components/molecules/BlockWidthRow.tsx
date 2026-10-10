'use client'

/**
 * The block menu's `width` row (6x, `PondMenu.dc.html`'s `widths` map): six
 * cells, ¼ ⅓ ½ ⅔ ¾ full, drawn as the menu's `width` group `content`. Rest
 * state only — no width is absent, so a block with none reads as `full`.
 *
 * Each cell is a `Menu.Item`: Base UI's own roving focus and typeahead inside
 * the menu, no handler of our own (KAN-246 owns ← → and the hover/arrow
 * preview this row does not draw).
 *
 * Class strings are template literals, not `cn()` — `PondMenu.tsx`'s same
 * note: tailwind-merge reads an arbitrary text size as a colour and drops one
 * of the two when the cells mix `text-[11px]` with `text-raw-paper`.
 */

import { Menu } from '@base-ui/react/menu'
import type { BlockWidth } from '@/lib/modules/content'

export interface BlockWidthRowProps {
  /** Absent reads as `full` — a block with no width. */
  width: BlockWidth | undefined
  onSelect: (width: BlockWidth) => void
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
  'text-mn-text outline-none transition-[background] duration-150 [transition-timing-function:cubic-bezier(.22,.8,.2,1)]'

const CELL_FULL = 'flex-[1.4] font-mono text-[11px]'
const CELL_FRACTION = 'flex-1 font-sans text-[14px]'
const CELL_FILLED = 'bg-mn-text text-raw-paper dark:text-raw-ink'

export const BlockWidthRow = ({ width, onSelect }: BlockWidthRowProps) => {
  const current = width ?? 'full'

  return (
    <div className={ROW}>
      {WIDTHS.map(({ label, value }) => (
        <Menu.Item
          key={value}
          label={label}
          onClick={() => onSelect(value)}
          className={`${CELL} ${value === 'full' ? CELL_FULL : CELL_FRACTION} ${
            value === current ? CELL_FILLED : ''
          }`}
        >
          {label}
        </Menu.Item>
      ))}
    </div>
  )
}
