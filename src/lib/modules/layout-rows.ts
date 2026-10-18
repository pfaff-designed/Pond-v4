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
 * A named width's fixed percent of the content column, rounded to one decimal
 * place (⅓ and ⅔ don't divide evenly) — the same rounding a free width is kept
 * to at its write boundary (KAN-441), so a block committed at a snapped ⅓ and
 * a block set to the named `'1/3'` render pixel-identical via `widthPercent`.
 */
const NAMED_WIDTH_PERCENT: Record<BlockWidth, number> = {
  '1/4': 25,
  '1/3': 33.3,
  '1/2': 50,
  '2/3': 66.7,
  '3/4': 75,
  full: 100,
}

/**
 * A width's percent of the content column (KAN-441): a named width's fixed
 * percent (`NAMED_WIDTH_PERCENT`), or a free width's own value — a number
 * already IS its percent of the column. Absent means full (6x).
 */
export function widthPercent(width: BlockWidth | number | undefined): number {
  if (typeof width === 'number') return width
  return NAMED_WIDTH_PERCENT[width ?? 'full']
}

/**
 * `widthPercent`, in tenths of a percent (integer) rather than a float — row
 * sums compare exactly this way, the same reason `TWELFTHS` exists, now
 * generalized to cover a free numeric width packing or stacking beside a
 * named one (KAN-441).
 */
function widthTenths(width: BlockWidth | number | undefined): number {
  return Math.round(widthPercent(width) * 10)
}

/**
 * Pack `blocks` into rows: each row's widths sum to 1000 tenths-of-a-percent
 * (full) or less. A block that would push the current row over starts a new
 * row instead, and so does a block carrying `rowStart: true`, even with room
 * left in the current row (KAN-440) — a drop plan sets it so a partial-width
 * block left behind never re-packs the rows after it. A free numeric width
 * (KAN-441) packs and overflows by its own percent the same way, alongside
 * named widths in the same row. Rows are built in array order, so flattening
 * them back out reproduces that order — a caller that needs a block's
 * original index can read it off the flattened position instead of threading
 * a wrapper through.
 */
export function layoutRows<T extends { width?: BlockWidth | number; rowStart?: boolean }>(
  blocks: readonly T[]
): T[][] {
  const rows: T[][] = []
  let row: T[] = []
  let used = 0

  for (const block of blocks) {
    const width = widthTenths(block.width)
    if (row.length > 0 && (block.rowStart === true || used + width > 1000)) {
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

/**
 * Plans a beside drop (6x): splices `blocks[fromIndex]` into the row that
 * holds `targetId`, on `zone`'s side, and applies `widthsForDropBeside`'s
 * widths to every block now in that row. The planned row's first block gets
 * `rowStart: true` and every other block in it has the key cleared (KAN-440
 * Comment 2) — that is what stops a partial-width block left behind from
 * repacking rows below it, so the row a person saw in the hover line is not
 * one `layoutRows` can merge into its neighbour. Returns `null` only when the
 * row already holds 4 (so there is nothing to plan); with `rowStart` forcing
 * the row open, the previous repack refusal never fires. Both the hover (drop
 * line + preview) and the commit call this one planner, so what's shown is
 * exactly what's committed. Removes the dragged block via `detachKeepingRows`
 * (KAN-440), so if it carried `rowStart` and left a row-mate behind, that
 * row-mate inherits it rather than silently re-packing into the row before it.
 */
export function planBesideDrop<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(blocks: readonly T[], fromIndex: number, targetId: string, zone: 'left' | 'right'): T[] | null {
  const dragged = blocks[fromIndex]
  const { blocks: withoutDragged } = detachKeepingRows(blocks, fromIndex)
  const row = layoutRows(withoutDragged).find((r) => r.some((b) => b.id === targetId))
  if (!row) return null

  const widths = widthsForDropBeside(
    row.map((b) => {
      // A row-mate only ever carries a free-resized numeric width if it's alone
      // on its line (this ticket's scope) — which can't also be a row-mate.
      if (typeof b.width === 'number') {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('planBesideDrop: a row-mate held a free-resized width')
        }
        return 'full'
      }
      return b.width ?? 'full'
    })
  )
  if (!widths) return null

  const nextWidth = new Map(row.map((b, i) => [b.id, widths[i]]))
  nextWidth.set(dragged.id, widths[widths.length - 1])

  const targetAt = withoutDragged.findIndex((b) => b.id === targetId)
  const spliced = [...withoutDragged]
  spliced.splice(zone === 'left' ? targetAt : targetAt + 1, 0, dragged)

  const plannedRowIds = new Set([...row.map((b) => b.id), dragged.id])
  const rowStartId = spliced.find((b) => plannedRowIds.has(b.id))!.id

  const next = spliced.map((b) => {
    if (!plannedRowIds.has(b.id)) return b
    const widthPatch = nextWidth.has(b.id) ? { width: nextWidth.get(b.id) } : {}
    if (b.id === rowStartId) return { ...b, ...widthPatch, rowStart: true }
    const withoutRowStart: T = { ...b, ...widthPatch }
    delete (withoutRowStart as { rowStart?: boolean }).rowStart
    return withoutRowStart
  })

  const keptTogether = layoutRows(next).some(
    (r) => r.length === plannedRowIds.size && r.every((b) => plannedRowIds.has(b.id))
  )
  if (!keptTogether) {
    // Impossible for a row of 4 or fewer once `rowStart` forces it open (see
    // this function's own doc comment) — `widthsForDropBeside` above already
    // refused anything larger. Crash early in dev; fall back to the old
    // refusal in production rather than committing a row the planner itself
    // can't account for.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('planBesideDrop: a planned row of 4 or fewer did not stay together')
    }
    return null
  }

  return next
}

/** `detachKeepingRows`' result: the array with the handoff already applied, plus
 *  the id of whichever block inherited `rowStart`, so a caller that can later
 *  undo the removal (KAN-440) knows exactly what to reverse. `null` when no
 *  handoff happened — the removed block held no `rowStart`, or had no row-mate
 *  to hand it to. */
export interface DetachKeepingRowsResult<T> {
  blocks: T[]
  handedRowStartTo: string | null
}

/**
 * Removes `blocks[index]`, handing `rowStart` to the next member of the row
 * it leaves (KAN-440): a row's `rowStart` lives on exactly one block, so
 * taking that block out — a beside drop, an own-line drop, a delete, or
 * ⌥↑/⌥↓ — would otherwise leave its row-mates with no `rowStart` at all,
 * and `layoutRows` would merge them into whichever row precedes them. If
 * the removed block carried `rowStart: true` and the next block in
 * `blocks` was in the SAME row (per `layoutRows(blocks)`, computed before
 * the removal), that next block gets `rowStart: true` in the result; every
 * other block is the same reference, untouched.
 */
export function detachKeepingRows<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(blocks: readonly T[], index: number): DetachKeepingRowsResult<T> {
  const removed = blocks[index]
  const rest = blocks.filter((_, i) => i !== index)
  const noHandoff = { blocks: rest, handedRowStartTo: null }
  if (!removed || removed.rowStart !== true) return noHandoff

  const next = blocks[index + 1]
  if (!next) return noHandoff

  const row = layoutRows(blocks).find((r) => r.some((b) => b.id === removed.id))
  if (!row?.some((b) => b.id === next.id)) return noHandoff

  return {
    blocks: rest.map((b) => (b.id === next.id ? { ...b, rowStart: true } : b)),
    handedRowStartTo: next.id,
  }
}

/** Omits `rowStart` from a block — the field's own "absent means today's packing"
 *  convention (KAN-440), used to reverse a `detachKeepingRows` handoff on undo. */
export function withoutRowStart<T extends { rowStart?: boolean }>(block: T): T {
  if (block.rowStart === undefined) return block
  const next = { ...block }
  delete (next as { rowStart?: boolean }).rowStart
  return next
}

/** The gap between blocks in a row, and between stacked blocks (6x). */
export const BLOCK_ROW_GAP_PX = 16

/**
 * A block's own CSS width, independent of its row-mates: `(100% + gap) *
 * fraction - gap`. Summed over a row whose fractions add to a full 100%,
 * the `- gap` terms cancel the real gaps between the blocks exactly, so the
 * row totals 100% for any number of blocks in it — the formula
 * `Pond 06.23 Blocks side by side.dc.html` draws its rows with. A row whose
 * fractions add to less than full is short by the same amount, which is the
 * leftover paper at the row's end. A free numeric width (KAN-441) renders by
 * its own percent, via `widthPercent`.
 */
export function blockWidthStyle(width: BlockWidth | number = 'full'): string {
  const fraction = widthPercent(width) / 100
  return `calc((100% + ${BLOCK_ROW_GAP_PX}px) * ${fraction} - ${BLOCK_ROW_GAP_PX}px)`
}

/** Which drop zone a pointer is over, relative to a block's rect (6x). */
export type DropZone = 'left' | 'right' | 'above' | 'below'

/** A block's bounding rect, independent of any DOM type (6x drop-zone classifying). */
export interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

/** A pointer position, independent of any DOM event type (6x drop-zone classifying). */
export interface Point {
  x: number
  y: number
}

/** Fraction of a rect's width/height given to the own-line (above/below) edges and the beside edges (6x). */
const EDGE_FRACTION = 0.25

/**
 * The rects that make up `zone`'s own region of `rect` — the single home for drop-zone
 * geometry (KAN-440): both `classifyDropZone` (which zone a point falls in) and
 * `isWithinPaddedZone` (whether a point is still close enough to one) read these same
 * rects, so they can't disagree on what a zone covers the way the hand-simplified
 * halves/bands `isWithinPaddedZone` used to. `left`/`right` are each a union of two
 * rects — the outer 25% strip at full height, plus a middle-height quarter reaching to
 * the rect's midline — because the outer strip stays beside-left/right at any height,
 * but the inner quarter only does within the middle 50% of height (outside that band,
 * `above`/`below` claim it instead). `above`/`below` are each one rect: the middle 50%
 * of width, outer 25% of height.
 */
function dropZoneRects(rect: Rect, zone: DropZone): Rect[] {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const midX = rect.left + width / 2
  const leftOuterEdge = rect.left + width * EDGE_FRACTION
  const rightOuterEdge = rect.right - width * EDGE_FRACTION
  const topEdge = rect.top + height * EDGE_FRACTION
  const bottomEdge = rect.bottom - height * EDGE_FRACTION

  switch (zone) {
    case 'left':
      return [
        { left: rect.left, right: leftOuterEdge, top: rect.top, bottom: rect.bottom },
        { left: leftOuterEdge, right: midX, top: topEdge, bottom: bottomEdge },
      ]
    case 'right':
      return [
        { left: rightOuterEdge, right: rect.right, top: rect.top, bottom: rect.bottom },
        { left: midX, right: rightOuterEdge, top: topEdge, bottom: bottomEdge },
      ]
    case 'above':
      return [{ left: leftOuterEdge, right: rightOuterEdge, top: rect.top, bottom: topEdge }]
    case 'below':
      return [{ left: leftOuterEdge, right: rightOuterEdge, top: bottomEdge, bottom: rect.bottom }]
  }
}

function pointInRect(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

/**
 * Which drop zone a pointer point falls into over a block's rect, by checking
 * `dropZoneRects`' rects in the order that resolves their shared boundaries: the
 * outer left/right strips first (full height, so they win over `above`/`below` at the
 * shared 25%/75%-width edges), then `above`/`below` (so they win over the middle-height
 * quarters at the shared 25%/75%-height edges), then the right quarter before the left
 * one, so a point exactly on the rect's midline — equidistant from both — resolves to
 * `right`, matching the "nearer to, ties go right" rule.
 *
 * `onDragOver` fires for points outside the dragstart snapshot rect too (a block's
 * handle sits outside its own root; a beside preview can push a row below its
 * snapshotted position) — a point outside `rect` is clamped onto it first, so it
 * classifies as whichever zone its nearest in-rect point would.
 */
export function classifyDropZone(rect: Rect, point: Point): DropZone {
  const clamped: Point = {
    x: Math.min(Math.max(point.x, rect.left), rect.right),
    y: Math.min(Math.max(point.y, rect.top), rect.bottom),
  }

  const [leftOuter, leftQuarter] = dropZoneRects(rect, 'left')
  const [rightOuter, rightQuarter] = dropZoneRects(rect, 'right')
  const [above] = dropZoneRects(rect, 'above')
  const [below] = dropZoneRects(rect, 'below')

  if (pointInRect(leftOuter, clamped)) return 'left'
  if (pointInRect(rightOuter, clamped)) return 'right'
  if (pointInRect(above, clamped)) return 'above'
  if (pointInRect(below, clamped)) return 'below'
  if (pointInRect(rightQuarter, clamped)) return 'right'
  if (pointInRect(leftQuarter, clamped)) return 'left'

  // Unreachable: the outer strips, above/below and the two quarters together already
  // cover every point in the rect, so one of the checks above always returns first.
  // Crash early in dev; fall back to 'left' in production rather than silently
  // misclassifying a point none of the checks was supposed to miss.
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('classifyDropZone: a point matched none of the zone rects')
  }
  return 'left'
}

/** Hysteresis margin (KAN-440): a chosen zone holds until the pointer leaves its own region by this much. */
export const DROP_ZONE_HYSTERESIS_PX = 8

/** The shortest distance from `point` to `rect` — 0 when `point` is inside it (6x drop-zone hysteresis). */
function distanceToRect(rect: Rect, point: Point): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right)
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom)
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Whether `point` is still within `DROP_ZONE_HYSTERESIS_PX` of `zone`'s own region of
 * `rect` — the same rects `classifyDropZone` reads (KAN-440), not a hand-simplified
 * half/band, so this can never hold a zone past geometry `classifyDropZone` itself
 * would call something else (e.g. the top-middle of the left half, which
 * `classifyDropZone` calls `above`, no longer stays `left` just because it's within
 * the old rect's simplified full-height left half). Once a zone is chosen,
 * `onDragOver` keeps it as long as this stays true, so a preview-induced rect shift or
 * a few px of pointer jitter never flips it; only a point that actually clears the
 * padding reclassifies with `classifyDropZone`.
 */
export function isWithinPaddedZone(rect: Rect, point: Point, zone: DropZone): boolean {
  const distance = Math.min(...dropZoneRects(rect, zone).map((r) => distanceToRect(r, point)))
  return distance <= DROP_ZONE_HYSTERESIS_PX
}

/** Below this, a block in a row is too narrow to be useful, so the row stacks (6x). */
export const MIN_BLOCK_WIDTH_PX = 240

/** A block's actual pixel width at a given column width — `blockWidthStyle`'s formula, numeric. */
function blockWidthPx(columnWidthPx: number, width: BlockWidth | number): number {
  const fraction = widthPercent(width) / 100
  return (columnWidthPx + BLOCK_ROW_GAP_PX) * fraction - BLOCK_ROW_GAP_PX
}

/**
 * A row holds while every block in it gets at least `MIN_BLOCK_WIDTH_PX` of the
 * column; below that it stacks instead (6x), each block full width in reading
 * order. `widths` is the row's blocks' own widths, absent meaning full — a free
 * numeric width (KAN-441) stacks by the same rule, via `blockWidthPx`.
 */
export function rowHolds(columnWidthPx: number, widths: readonly (BlockWidth | number)[]): boolean {
  return widths.every((width) => blockWidthPx(columnWidthPx, width) >= MIN_BLOCK_WIDTH_PX)
}
