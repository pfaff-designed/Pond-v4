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
export function widthTenths(width: BlockWidth | number | undefined): number {
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

/** `MIN_ROOM_TWELFTHS`'s quarter, in tenths-of-a-percent — the numeric-width branch's threshold (KAN-441). */
const MIN_ROOM_PERCENT_TENTHS = 250

/**
 * The widths for `[...existing, droppedBlock]` when a block is dropped beside a
 * row, or `null` if the row already holds the max of four (6x). Named-only rows
 * (no numeric width in `existing`) behave exactly as before, by exact twelfths:
 * with room for at least a quarter, the dropped block takes the widest
 * `BlockWidth` that fits the room and the existing blocks keep their widths
 * untouched; with less room — including none, and the "sixth after ⅓ + ½" case
 * — every block in the row, existing and dropped alike, becomes the equal share
 * for the new count.
 *
 * A row holding a numeric width (KAN-441 — only possible today from a block
 * resized alone on its line, so `existing` has exactly one entry) is compared
 * in percent-tenths instead, the same integer comparison `layoutRows` uses:
 * with at least 25% of room left, the dropped block takes exactly that room as
 * a free percent and the existing widths are untouched, so the row stays full
 * and the resized block keeps its width; with less room, every block —
 * existing and dropped alike — becomes the equal (named) share, same as the
 * named-only case.
 */
export function widthsForDropBeside(
  existing: readonly (BlockWidth | number)[]
): (BlockWidth | number)[] | null {
  if (existing.length >= 4) return null

  if (existing.some((width) => typeof width === 'number')) {
    const usedTenths = existing.reduce<number>((sum, width) => sum + widthTenths(width), 0)
    const roomTenths = 1000 - usedTenths

    if (roomTenths >= MIN_ROOM_PERCENT_TENTHS) {
      return [...existing, roomTenths / 10]
    }

    const share = EQUAL_SHARE_WIDTH[existing.length + 1]
    return [...existing.map(() => share), share]
  }

  const named = existing as BlockWidth[]
  const used = named.reduce((sum, width) => sum + toTwelfths(width), 0)
  const room = 12 - used

  if (room >= MIN_ROOM_TWELFTHS) {
    const taken = TWELFTHS_ASCENDING.filter(([, twelfths]) => twelfths <= room).pop()
    // room >= MIN_ROOM_TWELFTHS guarantees at least '1/4' fits, so `taken` always exists.
    return [...named, taken![0]]
  }

  const share = EQUAL_SHARE_WIDTH[named.length + 1]
  return [...named.map(() => share), share]
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

  const widths = widthsForDropBeside(row.map((b) => b.width ?? 'full'))
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
    return withoutRowStart({ ...b, ...widthPatch })
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

/**
 * An own-line drop. The dragged block becomes `full` with `rowStart`. A single
 * former row-mate left alone is widened to `full`. A target row that is drawn
 * stacked — several stored widths, each rendered on its own line because one
 * of them is under `MIN_BLOCK_WIDTH_PX` — inserts beside the target block
 * itself, and each of those blocks is stored `full` with `rowStart`, so the
 * lines the person already sees stay lines. A row that actually holds inserts
 * before or after the whole row and keeps the widths already there.
 * `columnWidthPx` 0 never counts as stacked (the column isn't measured yet).
 *
 * `options.widenLoneMate` (default `true`, today's drag behaviour) widens a
 * single row-mate left behind to `full`. `planStepMove` (KAN-376) passes
 * `false`: an ⌥↓ step out of a row leaves the mate at its own width.
 */
export function planOwnLineDrop<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(
  blocks: readonly T[],
  fromIndex: number,
  targetId: string,
  zone: 'above' | 'below',
  columnWidthPx: number,
  options?: { widenLoneMate?: boolean }
): T[] | null {
  const widenLoneMate = options?.widenLoneMate ?? true
  const draggedId = blocks[fromIndex].id
  const originalRow = layoutRows(blocks).find((row) => row.some((block) => block.id === draggedId))
  const dragged = { ...blocks[fromIndex], width: 'full' as BlockWidth, rowStart: true as const }
  const { blocks: detached } = detachKeepingRows(blocks, fromIndex)
  const mateIds = new Set(
    (originalRow ?? []).map((block) => block.id).filter((id) => id !== draggedId)
  )
  const mateRow =
    mateIds.size > 0
      ? layoutRows(detached).find((row) => row.some((block) => mateIds.has(block.id)))
      : undefined
  const matesLeft = mateRow?.filter((block) => mateIds.has(block.id)) ?? []
  const withoutDragged =
    widenLoneMate && matesLeft.length === 1 && mateRow?.length === 1
      ? detached.map((block) =>
          block.id === matesLeft[0].id ? { ...block, width: 'full' as BlockWidth } : block
        )
      : detached
  const row = layoutRows(withoutDragged).find((r) => r.some((b) => b.id === targetId))
  if (!row) return null

  const drawnStacked =
    row.length > 1 && rowStacks(columnWidthPx, row.map((block) => block.width ?? 'full'))
  if (drawnStacked) {
    const memberIds = new Set(row.map((block) => block.id))
    const promoted = withoutDragged.map((block) =>
      memberIds.has(block.id)
        ? { ...block, width: 'full' as BlockWidth, rowStart: true as const }
        : block
    )
    const targetAt = promoted.findIndex((block) => block.id === targetId)
    const insertAt = zone === 'above' ? targetAt : targetAt + 1
    const spliced = [...promoted]
    spliced.splice(insertAt, 0, dragged)
    return spliced
  }

  const rowIds = new Set(row.map((block) => block.id))
  const rowAt = withoutDragged.reduce<number[]>(
    (acc, block, index) => (rowIds.has(block.id) ? [...acc, index] : acc),
    []
  )
  const insertAt = zone === 'above' ? rowAt[0] : rowAt[rowAt.length - 1] + 1
  const spliced = [...withoutDragged]
  spliced.splice(insertAt, 0, dragged)
  return spliced
}

/**
 * Plans an ⌥↑/⌥↓ step (KAN-376), over STORED rows (`layoutRows`) only —
 * never over how a row happens to be drawn. Whether a row renders side by
 * side or stacked (`rowStacks`, narrow column) is a canvas concern this
 * planner never sees, so it takes no `columnWidthPx`.
 *
 * A block sharing a stored row of 2+ members (drawn stacked or not) leaves
 * it onto its own full-width line directly above/below —
 * `planOwnLineDrop` with `widenLoneMate: false` so the mate left behind
 * keeps its width, and a `columnWidthPx` of 0 (always "holds") so
 * `planOwnLineDrop`'s own drawn-stacked branch — meant for dropping a
 * dragged block into a *different* stacked row — never fires here.
 *
 * Otherwise the block is alone in its stored row, and the step jumps the
 * WHOLE adjacent stored row: removed via `detachKeepingRows`, reinserted
 * just before the neighbour row's first block (up) or just after its last
 * (down), keeping its own width. The moved block always gets
 * `rowStart: true`, and so does whichever block now follows it, so
 * `layoutRows` can't re-pack either into the other's row.
 *
 * Either path can open a SEAM further down the array: the mate (or row)
 * left behind keeps its stored width, so it may have room, and the block
 * that comes after it in `blocks` may have relied on THAT width being full
 * (or on the removed block's own row) to start a line of its own. If that
 * follower started its own row before the move (first member of its row in
 * `layoutRows(blocks)`), it keeps `rowStart: true` in the result — never
 * written `false` — so `layoutRows` can't re-pack it into whatever now
 * precedes it. A follower that already shared a row with others (not a
 * row of its own) is untouched, so the guard never splits a row it should
 * leave alone.
 *
 * `null` when there is no row in that direction (the first/last block, or
 * already alone at the page's edge).
 */
export function planStepMove<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(blocks: readonly T[], index: number, dir: 'up' | 'down'): T[] | null {
  const block = blocks[index]
  const rows = layoutRows(blocks)
  const ownRowIndex = rows.findIndex((row) => row.some((b) => b.id === block.id))
  const ownRow = rows[ownRowIndex]

  if (ownRow.length > 1) {
    const mateId = ownRow.find((b) => b.id !== block.id)!.id
    const planned = planOwnLineDrop(blocks, index, mateId, dir === 'up' ? 'above' : 'below', 0, {
      widenLoneMate: false,
    })
    if (!planned) return null

    const lastMemberId = ownRow[ownRow.length - 1].id
    const lastMemberIndex = blocks.findIndex((b) => b.id === lastMemberId)
    const rowFollower = blocks[lastMemberIndex + 1]
    const rowFollowerStartsOwnRow =
      rowFollower !== undefined && rows.some((row) => row[0].id === rowFollower.id)
    if (!rowFollowerStartsOwnRow) return planned

    return planned.map((b) => (b.id === rowFollower.id ? withRowStartValue(b, true) : b))
  }

  const neighbourRow = rows[ownRowIndex + (dir === 'up' ? -1 : 1)]
  if (!neighbourRow) return null

  const follower = blocks[index + 1]
  const followerStartsOwnRow = follower !== undefined && rows.some((row) => row[0].id === follower.id)
  const followerId = follower?.id

  const { blocks: detached } = detachKeepingRows(blocks, index)
  const guarded = followerStartsOwnRow
    ? detached.map((b) => (b.id === followerId ? withRowStartValue(b, true) : b))
    : detached
  const moved = { ...block, rowStart: true as const }
  const anchorId = dir === 'up' ? neighbourRow[0].id : neighbourRow[neighbourRow.length - 1].id
  const anchorAt = guarded.findIndex((b) => b.id === anchorId)
  const insertAt = dir === 'up' ? anchorAt : anchorAt + 1

  const spliced = [...guarded]
  spliced.splice(insertAt, 0, moved)

  const followingAt = insertAt + 1
  if (followingAt >= spliced.length) return spliced
  spliced[followingAt] = { ...spliced[followingAt], rowStart: true }
  return spliced
}

/**
 * Plans an ⌥←/⌥→ step (KAN-376): swaps `blocks[index]` with its adjacent
 * row-mate. `rowStart` stays with the array slot, not the block, so a swap
 * can never hand a row's `rowStart` to the wrong block.
 * `null` when there is no row-mate on that side (the row holds one block, or
 * the block is already at that edge of its row).
 */
export function planRowSwap<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(blocks: readonly T[], index: number, dir: 'left' | 'right'): T[] | null {
  const row = layoutRows(blocks).find((r) => r.some((b) => b.id === blocks[index].id))!
  const posInRow = row.findIndex((b) => b.id === blocks[index].id)
  const neighbourPosInRow = posInRow + (dir === 'left' ? -1 : 1)
  if (neighbourPosInRow < 0 || neighbourPosInRow >= row.length) return null

  const targetIndex = index + (dir === 'left' ? -1 : 1)
  const atIndex = blocks[index]
  const atTarget = blocks[targetIndex]
  const next = [...blocks]
  next[index] = withRowStartValue(atTarget, atIndex.rowStart)
  next[targetIndex] = withRowStartValue(atIndex, atTarget.rowStart)
  return next
}

/** Sets or omits `rowStart` on `block` to exactly `rowStart` — `planRowSwap`'s
 *  "the slot keeps its own rowStart" swap. */
function withRowStartValue<T extends { rowStart?: boolean }>(
  block: T,
  rowStart: boolean | undefined
): T {
  return rowStart === true ? { ...block, rowStart: true } : withoutRowStart(block)
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
export const EDGE_FRACTION = 0.25

/**
 * The rects that make up `zone`'s own region of `rect` — the single home for drop-zone
 * geometry (KAN-440): both `classifyDropZone` (which zone a point falls in) and
 * `isWithinPaddedZone` (whether a point is still close enough to one) read these same
 * rects, so they can't disagree on what a zone covers.
 *
 * The top and bottom bands run the full width. A tall block (a calendar) otherwise
 * keeps beside-zones down its whole side, and a drop in the gap under it — the
 * place a person puts a block between two stacked ones — clamps onto that side
 * and squeezes the stack into one row. Beside is only the middle band: the left
 * or right half of the width, between 25% and 75% of the height.
 */
function dropZoneRects(rect: Rect, zone: DropZone): Rect[] {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const midX = rect.left + width / 2
  const topEdge = rect.top + height * EDGE_FRACTION
  const bottomEdge = rect.bottom - height * EDGE_FRACTION

  switch (zone) {
    case 'left':
      return [{ left: rect.left, right: midX, top: topEdge, bottom: bottomEdge }]
    case 'right':
      return [{ left: midX, right: rect.right, top: topEdge, bottom: bottomEdge }]
    case 'above':
      return [{ left: rect.left, right: rect.right, top: rect.top, bottom: topEdge }]
    case 'below':
      return [{ left: rect.left, right: rect.right, top: bottomEdge, bottom: rect.bottom }]
  }
}

function pointInRect(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

/**
 * Which drop zone a pointer point falls into over a block's rect. Above and
 * below are checked first, so the shared edge of the top and bottom bands is
 * an own-line drop — a point in the gap under a block, clamped onto its bottom
 * edge, stays `below` even at the corners. Right is checked before left, so a
 * point exactly on the midline resolves to `right`.
 *
 * `onDragOver` fires for points outside the dragstart snapshot rect too (a block's
 * handle sits outside its own root; a beside preview can push a row below its
 * snapshotted position) — a point outside `rect` is clamped onto it first, so it
 * classifies as whichever zone its nearest in-rect point would.
 */
/**
 * A row drawn as separate full-width lines has no beside. `left` and `right`
 * on that drawing are the own-line drop for whichever half of the block the
 * pointer is in — otherwise a drop on the middle of a line the person sees as
 * stacked writes a side-by-side row, and the next width that fits the column
 * snaps the lines horizontal.
 */
export function zoneWhenDrawnStacked(
  zone: DropZone,
  rect: Rect,
  point: Point,
  drawnStacked: boolean
): DropZone {
  if (!drawnStacked || zone === 'above' || zone === 'below') return zone
  const midY = rect.top + (rect.bottom - rect.top) / 2
  return point.y < midY ? 'above' : 'below'
}

export function classifyDropZone(rect: Rect, point: Point): DropZone {
  const clamped: Point = {
    x: Math.min(Math.max(point.x, rect.left), rect.right),
    y: Math.min(Math.max(point.y, rect.top), rect.bottom),
  }

  const [above] = dropZoneRects(rect, 'above')
  const [below] = dropZoneRects(rect, 'below')
  const [right] = dropZoneRects(rect, 'right')
  const [left] = dropZoneRects(rect, 'left')

  if (pointInRect(above, clamped)) return 'above'
  if (pointInRect(below, clamped)) return 'below'
  if (pointInRect(right, clamped)) return 'right'
  if (pointInRect(left, clamped)) return 'left'

  // Unreachable: the four bands cover every point in the rect.
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

/**
 * Row 0's own-line override (KAN-548): on the first row, the above band wins over
 * whatever beside zone is already held — `isWithinPaddedZone`'s 8px hysteresis would
 * otherwise keep a short first block's held `left`/`right` all the way into its top
 * corner, where a person releasing at the corner sees the above line but a beside
 * drop commits. Delegates to `classifyDropZone` itself rather than restating the
 * above band, so this can never disagree with it about where above ends or starts
 * (classifyDropZone's above band is inclusive of its bottom edge). Rows ≥1 keep
 * KAN-440's hysteresis untouched: this returns `null` (no override) for any row but
 * the first, and for a row-0 point outside the above band (mid-height left/right
 * stay beside) — regardless of which beside zone is currently held.
 */
export function rowZeroZone(rect: Rect, point: Point, isRowZero: boolean): DropZone | null {
  if (!isRowZero) return null
  return classifyDropZone(rect, point) === 'above' ? 'above' : null
}

/** Below this, a block in a row is too narrow to be useful, so the row stacks (6x). */
export const MIN_BLOCK_WIDTH_PX = 240

/**
 * `blockWidthStyle`'s formula, numeric: the actual rendered pixel width of a
 * block at `percent` of a column `columnWidthPx` wide. The one home for this
 * conversion (KAN-441) — an edge drag's clamp floor and its pointer-delta
 * mapping both read it (via `renderedPxToPercent`) rather than the naive
 * `percent/100 * columnWidthPx`, which ignores the `BLOCK_ROW_GAP_PX` term
 * and so disagrees with what the renderer actually draws.
 */
export function percentToRenderedPx(columnWidthPx: number, percent: number): number {
  const fraction = percent / 100
  return (columnWidthPx + BLOCK_ROW_GAP_PX) * fraction - BLOCK_ROW_GAP_PX
}

/** Inverse of `percentToRenderedPx` — the percent whose rendered width is `renderedPx`. */
export function renderedPxToPercent(columnWidthPx: number, renderedPx: number): number {
  return ((renderedPx + BLOCK_ROW_GAP_PX) / (columnWidthPx + BLOCK_ROW_GAP_PX)) * 100
}

/** A block's actual pixel width at a given column width — `blockWidthStyle`'s formula, numeric. */
function blockWidthPx(columnWidthPx: number, width: BlockWidth | number): number {
  return percentToRenderedPx(columnWidthPx, widthPercent(width))
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

/**
 * A row is drawn stacked — every block 100% wide — once the column is measured
 * and `rowHolds` says no. The one home for that decision: the canvas's sizing
 * divs and `drawnWidthPercent` both read it. An unmeasured column (0) never stacks.
 */
export function rowStacks(columnWidthPx: number, widths: readonly (BlockWidth | number)[]): boolean {
  return columnWidthPx > 0 && !rowHolds(columnWidthPx, widths)
}

/**
 * The percent of the column a block alone on its line is DRAWN at: 100 when its
 * stored width would stack, else the stored width. A drag starts from this, not
 * from the stored width, so pressing an edge never changes what is on screen.
 */
export function drawnWidthPercent(columnWidthPx: number, width: BlockWidth | number | undefined): number {
  return rowStacks(columnWidthPx, [width ?? 'full']) ? 100 : widthPercent(width)
}
