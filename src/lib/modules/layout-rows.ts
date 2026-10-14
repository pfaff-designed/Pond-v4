/**
 * Row packing for block widths (6x) — pure, no React.
 *
 * Rows are derived, never stored: `layoutRows` packs consecutive blocks into a row
 * while their widths add up to full or less, in array order (reading order is left
 * to right, then down). The next block that doesn't fit starts a new row.
 *
 * Widths are compared as twelfths (the LCM of the six denominators) rather than
 * floats, so `1/3 + 1/3 + 1/3` sums to exactly 12 with no rounding error.
 */
import type { BlockWidth } from './content'

const TWELFTHS: Record<BlockWidth, number> = {
  '1/4': 3,
  '1/3': 4,
  '1/2': 6,
  '2/3': 8,
  '3/4': 9,
  full: 12,
}

/** A width's size in twelfths. Absent means full (6x). */
function toTwelfths(width: BlockWidth | undefined): number {
  return TWELFTHS[width ?? 'full']
}

/**
 * Pack `blocks` into rows: each row's widths sum to 12 twelfths (full) or less. A
 * block that would push the current row over 12 starts a new row instead. Rows
 * are built in array order, so flattening them back out reproduces that order —
 * a caller that needs a block's original index can read it off the flattened
 * position instead of threading a wrapper through.
 */
export function layoutRows<T extends { width?: BlockWidth }>(blocks: readonly T[]): T[][] {
  const rows: T[][] = []
  let row: T[] = []
  let used = 0

  for (const block of blocks) {
    const width = toTwelfths(block.width)
    if (row.length > 0 && used + width > 12) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push(block)
    used += width
  }
  if (row.length > 0) rows.push(row)

  return rows
}

/** Twelfths sorted ascending, so the widest fit for a given room is the last one that's `<= room`. */
const TWELFTHS_ASCENDING = Object.entries(TWELFTHS).sort(([, a], [, b]) => a - b) as [
  BlockWidth,
  number,
][]

/** Equal share of a row's twelve twelfths across `count` blocks — only 2, 3 and 4 ever apply (6x). */
const EQUAL_SHARE_WIDTH: Record<number, BlockWidth> = {
  2: '1/2',
  3: '1/3',
  4: '1/4',
}

/** Below a quarter, a dropped block can't fit beside anything — the row shares equally instead (6x). */
const MIN_ROOM_TWELFTHS = TWELFTHS['1/4']

/**
 * The widths for `[...existing, droppedBlock]` when a block is dropped beside a
 * row, or `null` if the row already holds the max of four (6x). With room for at
 * least a quarter, the dropped block takes the widest `BlockWidth` that fits the
 * room and the existing blocks keep their widths untouched. With less room —
 * including none, and the "sixth after ⅓ + ½" case — every block in the row,
 * existing and dropped alike, becomes the equal share for the new count.
 */
export function widthsForDropBeside(existing: readonly BlockWidth[]): BlockWidth[] | null {
  if (existing.length >= 4) return null

  const used = existing.reduce((sum, width) => sum + toTwelfths(width), 0)
  const room = 12 - used

  if (room >= MIN_ROOM_TWELFTHS) {
    const taken = TWELFTHS_ASCENDING.filter(([, twelfths]) => twelfths <= room).pop()
    // room >= MIN_ROOM_TWELFTHS guarantees at least '1/4' fits, so `taken` always exists.
    return [...existing, taken![0]]
  }

  const share = EQUAL_SHARE_WIDTH[existing.length + 1]
  return [...existing.map(() => share), share]
}

/** The gap between blocks in a row, and between stacked blocks (6x). */
export const BLOCK_ROW_GAP_PX = 16

/**
 * A block's own CSS width, independent of its row-mates: `(100% + gap) *
 * fraction - gap`. Summed over a row whose fractions add to a full twelve
 * twelfths, the `- gap` terms cancel the real gaps between the blocks exactly,
 * so the row totals 100% for any number of blocks in it — the formula
 * `Pond 06.23 Blocks side by side.dc.html` draws its rows with. A row whose
 * fractions add to less than full is short by the same amount, which is the
 * leftover paper at the row's end.
 */
export function blockWidthStyle(width: BlockWidth = 'full'): string {
  const fraction = TWELFTHS[width] / 12
  return `calc((100% + ${BLOCK_ROW_GAP_PX}px) * ${fraction} - ${BLOCK_ROW_GAP_PX}px)`
}

/** Below this, a block in a row is too narrow to be useful, so the row stacks (6x). */
const MIN_BLOCK_WIDTH_PX = 240

/** A block's actual pixel width at a given column width — `blockWidthStyle`'s formula, numeric. */
function blockWidthPx(columnWidthPx: number, width: BlockWidth): number {
  const fraction = TWELFTHS[width] / 12
  return (columnWidthPx + BLOCK_ROW_GAP_PX) * fraction - BLOCK_ROW_GAP_PX
}

/**
 * A row holds while every block in it gets at least `MIN_BLOCK_WIDTH_PX` of the
 * column; below that it stacks instead (6x), each block full width in reading
 * order. `widths` is the row's blocks' own widths, absent meaning full.
 */
export function rowHolds(columnWidthPx: number, widths: readonly BlockWidth[]): boolean {
  return widths.every((width) => blockWidthPx(columnWidthPx, width) >= MIN_BLOCK_WIDTH_PX)
}
