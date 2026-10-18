/**
 * Edge-drag resize math (KAN-441) — pure, no React.
 *
 * Dragging a block's edge snaps like a Photoshop/Figma guide: within
 * `LOCK_PX` of a key width's pixel position the edge locks there; once
 * locked, it stays locked until the pointer moves `RELEASE_PX` from that
 * same key, then it breaks out and tracks the pointer freely.
 */
import {
  layoutRows,
  MIN_BLOCK_WIDTH_PX,
  percentToRenderedPx,
  renderedPxToPercent,
  widthPercent,
} from './layout-rows'
import type { BlockWidth } from './content'

/** The six snap targets, in column order — each percent read from `widthPercent`
 *  so a key width and the matching named `BlockWidth` (`BlockWidthRow.tsx`'s own
 *  glyphs, which read their label/value pairs from this same array) can never
 *  drift apart. `width` is the one home for the glyph→named mapping, so a
 *  locked edge-drag release can commit the named form instead of its number. */
export const KEY_WIDTHS: { label: string; percent: number; width: BlockWidth }[] = [
  { label: '¼', percent: widthPercent('1/4'), width: '1/4' },
  { label: '⅓', percent: widthPercent('1/3'), width: '1/3' },
  { label: '½', percent: widthPercent('1/2'), width: '1/2' },
  { label: '⅔', percent: widthPercent('2/3'), width: '2/3' },
  { label: '¾', percent: widthPercent('3/4'), width: '3/4' },
  { label: 'full', percent: widthPercent('full'), width: 'full' },
]

/** Within this many px of a key width's position, the edge locks there. */
const LOCK_PX = 8

/** This many px past the lock itself (`LOCK_PX` further than the lock distance), the edge breaks out. */
const RELEASE_PX = LOCK_PX * 2

/** Float dust guard for the `<=` threshold checks below — a percent arithmetic
 *  chain (e.g. `33.3 - 2`) lands a few `1e-15`s past an exact 16px, which is
 *  not a real pointer movement worth releasing the lock over. */
const EPSILON_PX = 1e-9

/**
 * Float dust guard for the clamp floor: `renderedPxToPercent` and
 * `percentToRenderedPx` round-trip through a division, which can land the
 * floor a `~1e-11` sliver under `MIN_BLOCK_WIDTH_PX`'s own rendered px —
 * inside `rowHolds`' stacking band (AGENTS.md "crash early" doesn't apply
 * here; this is display math, not an impossible state). Nudging the floor
 * up by this much guards only this *unrounded* live percent — it does not
 * by itself protect the one-decimal value a free release actually writes,
 * since ordinary rounding can still carry a value from just above the floor
 * to just below it (see `roundFreePercent`). The nudge is many orders of
 * magnitude past any float dust this round-trip can produce.
 */
const FLOOR_EPSILON_PERCENT = 1e-6

export interface SnapResult {
  percent: number
  locked: boolean
}

function percentToPx(percent: number, columnPx: number): number {
  return (percent / 100) * columnPx
}

/** The key width nearest `rawPercent`'s pixel position, and how far away it is. */
function nearestKeyWidth(rawPercent: number, columnPx: number): { percent: number; distancePx: number } {
  const rawPx = percentToPx(rawPercent, columnPx)
  let nearestPercent = KEY_WIDTHS[0].percent
  let nearestDistance = Infinity
  for (const key of KEY_WIDTHS) {
    const distance = Math.abs(percentToPx(key.percent, columnPx) - rawPx)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestPercent = key.percent
    }
  }
  return { percent: nearestPercent, distancePx: nearestDistance }
}

/**
 * Snaps `rawPercent` (the pointer's raw position, as a percent of the column)
 * to a key width, with hysteresis: `lockedPercent` is the key this edge was
 * locked to on the previous call, or `null` if it wasn't locked. Locked, the
 * edge holds that same key until the pointer moves `RELEASE_PX` from it, then
 * releases and tracks `rawPercent` freely for this call (it does not
 * immediately re-lock to whatever key the release point happens to be near —
 * the caller's next call, unlocked, will pick that up on its own). Unlocked,
 * the edge locks onto whichever key is within `LOCK_PX`, if any.
 */
export function snapPercent(
  rawPercent: number,
  columnPx: number,
  lockedPercent: number | null
): SnapResult {
  if (lockedPercent !== null) {
    const distancePx = Math.abs(percentToPx(rawPercent, columnPx) - percentToPx(lockedPercent, columnPx))
    if (distancePx <= RELEASE_PX + EPSILON_PX) return { percent: lockedPercent, locked: true }
    return { percent: rawPercent, locked: false }
  }

  const { percent, distancePx } = nearestKeyWidth(rawPercent, columnPx)
  if (distancePx <= LOCK_PX + EPSILON_PX) return { percent, locked: true }
  return { percent: rawPercent, locked: false }
}

/**
 * Resizes a block alone on its line from one of its edges: `startPercent`'s
 * *rendered* pixel position (`percentToRenderedPx`, the same formula the
 * block actually draws at) plus `deltaPx` — real pointer-move pixels — is
 * converted back to a percent (`renderedPxToPercent`) and snapped via
 * `snapPercent`, then clamped to `MIN_BLOCK_WIDTH_PX`..100% of *rendered*
 * pixels (the clamp floor is `renderedPxToPercent(columnPx, MIN_BLOCK_WIDTH_PX)`,
 * not the naive `MIN_BLOCK_WIDTH_PX / columnPx`, which lands inside the
 * `rowHolds` stacking band for any width whose rendered size is shorter than
 * its percent-of-column share — see `BLOCK_ROW_GAP_PX`). A clamp overrides
 * the snap's lock — the reported width is no longer the locked key's own
 * position, so `locked` is `false` whenever the clamp actually moved the
 * value.
 */
export function resizeAlone(
  columnPx: number,
  startPercent: number,
  deltaPx: number,
  lockedPercent: number | null
): SnapResult {
  const rawPercent = renderedPxToPercent(columnPx, percentToRenderedPx(columnPx, startPercent) + deltaPx)
  const snapped = snapPercent(rawPercent, columnPx, lockedPercent)
  const minPercent = renderedPxToPercent(columnPx, MIN_BLOCK_WIDTH_PX) + FLOOR_EPSILON_PERCENT
  const clampedPercent = Math.min(100, Math.max(minPercent, snapped.percent))
  if (clampedPercent !== snapped.percent) return { percent: clampedPercent, locked: false }
  return snapped
}

/**
 * Rounds a free (unlocked) percent to one decimal place for commit — the one
 * home for "a committed tenth never renders under the floor" (AGENTS.md DRY).
 * Plain `Math.round(percent * 10) / 10` rounds DOWN at roughly half of all
 * column widths when `percent` sits at or near the clamp floor: e.g. at a
 * 900px column the floor is 27.9476...%, which rounds to 27.9, renders
 * 239.56px, and `rowHolds` then stacks the row — the block the person just
 * dragged renders 100% wide on release, the opposite of the drag. Ceils to
 * the next tenth instead whenever the ordinary round would land under the
 * column's own rendered floor; `percent` is always already `>=` that floor
 * (`resizeAlone`'s own clamp), so ceiling can only move it up, never past 100.
 */
export function roundFreePercent(percent: number, columnPx: number): number {
  const rounded = Math.round(percent * 10) / 10
  if (percentToRenderedPx(columnPx, rounded) >= MIN_BLOCK_WIDTH_PX) return rounded
  return Math.ceil(percent * 10) / 10
}

/**
 * Applies `newWidth` to `blocks[index]` and, only when that shrink just opened
 * enough room for a row-mate to newly pack in per `layoutRows`, adds
 * `rowStart: true` to whichever block would otherwise newly join a row (SPEC.md's
 * rowStart contract: a resize changes widths only, never re-packs). Two
 * directions can each newly admit a block: the next block can pack into the
 * resized block's own row, and the resized block itself can pack UP into the
 * previous block's row — shrinking a block alone on its line doesn't just
 * risk pulling its neighbour in, it can walk itself into the row above. Either
 * handoff is skipped when: there is no such neighbour; that neighbour already
 * carries `rowStart` (next) or the resized block itself already does (self —
 * it already won't repack); the resize is a grow or no-op (a row can only ever
 * newly admit a block by shrinking, never by growing); the pair was already in
 * the same row before the resize (nothing changes for it); or the pair still
 * doesn't share a row after the resize.
 */
export function handOffRowStartOnResize<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(blocks: readonly T[], index: number, newWidth: BlockWidth | number): T[] {
  const resized = blocks[index]
  const next = blocks[index + 1]
  const prev = blocks[index - 1]
  const withNewWidth = blocks.map((block, i) => (i === index ? { ...block, width: newWidth } : block))

  if (!resized) return withNewWidth
  if (widthPercent(newWidth) >= widthPercent(resized.width)) return withNewWidth

  const sameRow = (rows: T[][], aId: string, bId: string): boolean =>
    rows.some((row) => row.some((b) => b.id === aId) && row.some((b) => b.id === bId))

  const rowsBefore = layoutRows(blocks)

  const handOffToSelf =
    resized.rowStart !== true &&
    !!prev &&
    !sameRow(rowsBefore, resized.id, prev.id) &&
    sameRow(layoutRows(withNewWidth), resized.id, prev.id)

  // Self's own rowStart is decided first and applied before checking the next
  // block: giving the resized block rowStart starts a fresh row at it, and
  // that fresh row can newly have room for `next` even where `withNewWidth`
  // alone (resized block still packed into `prev`'s row) would not show it.
  const withSelfHandoff = handOffToSelf
    ? withNewWidth.map((block) => (block.id === resized.id ? { ...block, rowStart: true } : block))
    : withNewWidth

  const handOffToNext =
    !!next &&
    next.rowStart !== true &&
    !sameRow(rowsBefore, resized.id, next.id) &&
    sameRow(layoutRows(withSelfHandoff), resized.id, next.id)

  if (!handOffToNext && !handOffToSelf) return withNewWidth

  return withSelfHandoff.map((block) => {
    if (handOffToNext && next && block.id === next.id) return { ...block, rowStart: true }
    return block
  })
}
