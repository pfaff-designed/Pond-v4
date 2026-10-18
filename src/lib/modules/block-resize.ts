/**
 * Edge-drag resize math (KAN-441) — pure, no React.
 *
 * Dragging a block's edge snaps like a Photoshop/Figma guide: within
 * `LOCK_PX` of a key width's pixel position the edge locks there; once
 * locked, it stays locked until the pointer moves `RELEASE_PX` from that
 * same key, then it breaks out and tracks the pointer freely.
 */
import { layoutRows, MIN_BLOCK_WIDTH_PX, widthPercent } from './layout-rows'
import type { BlockWidth } from './content'

/** The six snap targets, in column order — each percent read from `widthPercent`
 *  so a key width and the matching named `BlockWidth` (`BlockWidthRow.tsx`'s own
 *  glyphs) can never drift apart. */
export const KEY_WIDTHS: { label: string; percent: number }[] = [
  { label: '¼', percent: widthPercent('1/4') },
  { label: '⅓', percent: widthPercent('1/3') },
  { label: '½', percent: widthPercent('1/2') },
  { label: '⅔', percent: widthPercent('2/3') },
  { label: '¾', percent: widthPercent('3/4') },
  { label: 'full', percent: widthPercent('full') },
]

/** Within this many px of a key width's position, the edge locks there. */
const LOCK_PX = 8

/** This many px past the lock itself (`LOCK_PX` further than the lock distance), the edge breaks out. */
const RELEASE_PX = LOCK_PX * 2

/** Float dust guard for the `<=` threshold checks below — a percent arithmetic
 *  chain (e.g. `33.3 - 2`) lands a few `1e-15`s past an exact 16px, which is
 *  not a real pointer movement worth releasing the lock over. */
const EPSILON_PX = 1e-9

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
 * pixel position plus `deltaPx` is snapped via `snapPercent`, then clamped to
 * `MIN_BLOCK_WIDTH_PX`..100%. A clamp overrides the snap's lock — the
 * reported width is no longer the locked key's own position, so `locked` is
 * `false` whenever the clamp actually moved the value.
 */
export function resizeAlone(
  columnPx: number,
  startPercent: number,
  deltaPx: number,
  lockedPercent: number | null
): SnapResult {
  const rawPercent = ((percentToPx(startPercent, columnPx) + deltaPx) / columnPx) * 100
  const snapped = snapPercent(rawPercent, columnPx, lockedPercent)
  const minPercent = (MIN_BLOCK_WIDTH_PX / columnPx) * 100
  const clampedPercent = Math.min(100, Math.max(minPercent, snapped.percent))
  if (clampedPercent !== snapped.percent) return { percent: clampedPercent, locked: false }
  return snapped
}

/**
 * Applies `newWidth` to `blocks[index]` and, only when that shrink just opened
 * enough room in its row for the next block to pack into it per `layoutRows`,
 * adds `rowStart: true` to that next block so the row stays as it was (SPEC.md's
 * rowStart contract: a resize changes widths only, never re-packs). Does
 * nothing beyond the width write when: there is no next block; the next block
 * already carries `rowStart` (it already won't repack); the resize is a grow or
 * no-op (a row can only ever newly admit a block by shrinking, never by
 * growing); the next block was already in the resized block's row before the
 * resize (nothing changes for it); or the next block still doesn't fit after
 * the resize.
 */
export function handOffRowStartOnResize<
  T extends { id: string; width?: BlockWidth | number; rowStart?: boolean },
>(blocks: readonly T[], index: number, newWidth: BlockWidth | number): T[] {
  const resized = blocks[index]
  const next = blocks[index + 1]
  const withNewWidth = blocks.map((block, i) => (i === index ? { ...block, width: newWidth } : block))

  if (!resized || !next || next.rowStart === true) return withNewWidth
  if (widthPercent(newWidth) >= widthPercent(resized.width)) return withNewWidth

  const sameRow = (rows: T[][], aId: string, bId: string): boolean =>
    rows.some((row) => row.some((b) => b.id === aId) && row.some((b) => b.id === bId))

  if (sameRow(layoutRows(blocks), resized.id, next.id)) return withNewWidth
  if (!sameRow(layoutRows(withNewWidth), resized.id, next.id)) return withNewWidth

  return withNewWidth.map((block) => (block.id === next.id ? { ...block, rowStart: true } : block))
}
