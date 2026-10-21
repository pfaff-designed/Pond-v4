/**
 * Height of a view, image, table or chart block (KAN-442).
 *
 * Optional `height` on the block is a pixel override. Absent means the block's
 * own content height ("fit"). A drag locks within {@link HEIGHT_SNAP_PX} of fit
 * and of each other block in the same row, and breaks out once the pointer is
 * past that. Text-like blocks never take a height.
 */
import type { Block } from './content'

/** How close, in px, a dragged edge must be before it locks to a guide. */
export const HEIGHT_SNAP_PX = 8
/** Arrow keys move the edge by this many pixels. Shift multiplies it. */
export const HEIGHT_STEP_PX = 8
export const HEIGHT_SHIFT_STEP_PX = 40
/** The scrolling body never goes shorter than this, on top of the fixed head. */
export const HEIGHT_BODY_MIN_PX = 120

const HEIGHT_BLOCK_TYPES = new Set(['view', 'image', 'table'])

/** Views (every kind, including chart), images and tables. Not prose. */
export function blockAcceptsHeight(block: { type: string }): boolean {
  return HEIGHT_BLOCK_TYPES.has(block.type)
}

/** Drop a stored height so the block returns to its content. */
export function blockWithoutHeight(block: Block): Block {
  if (block.height == null) return block
  const { height: _height, ...rest } = block
  return rest as Block
}

export interface HeightGuide {
  height: number
  /** `'fit'` is this block's content. Anything else is a neighbour's name. */
  label: 'fit' | (string & {})
}

export interface SnappedHeight {
  height: number
  /** `fit`, `= notes`, or `420px`. */
  readout: string
  lockedTo: 'fit' | 'neighbour' | null
}

/**
 * Lock `raw` to the nearest guide within {@link HEIGHT_SNAP_PX}, else follow
 * the pointer. Never below `min`. Fit wins a tie with a neighbour at the same
 * height. A guide shorter than `min` is not a lock — the edge cannot reach it.
 */
export function snapBlockHeight(
  raw: number,
  min: number,
  guides: readonly HeightGuide[]
): SnappedHeight {
  const clamped = Math.max(min, Math.round(raw))
  let best: { guide: HeightGuide; distance: number } | null = null
  for (const guide of guides) {
    if (!Number.isFinite(guide.height) || guide.height < min) continue
    const distance = Math.abs(clamped - Math.round(guide.height))
    if (distance > HEIGHT_SNAP_PX) continue
    const closer = best === null || distance < best.distance
    const fitWinsTie =
      best !== null &&
      distance === best.distance &&
      guide.label === 'fit' &&
      best.guide.label !== 'fit'
    if (closer || fitWinsTie) best = { guide, distance }
  }
  if (!best) return { height: clamped, readout: `${clamped}px`, lockedTo: null }
  const height = Math.max(min, Math.round(best.guide.height))
  if (best.guide.label === 'fit') return { height, readout: 'fit', lockedTo: 'fit' }
  return {
    height,
    readout: `= ${best.guide.label.toLowerCase()}`,
    lockedTo: 'neighbour',
  }
}

/** One keyboard step, clamped to `min`. */
export function stepBlockHeight(current: number, delta: number, min: number): number {
  return Math.max(min, Math.round(current + delta))
}

/**
 * Which height counts as "fit" for a gesture.
 *
 * An unsized block is already at its content height, so the live box wins —
 * a value remembered at an earlier paint (a board still loading its rows) is
 * shorter than the card the person is looking at. Once a height is stored,
 * the pane can be stretched over the content and the live box is that
 * stretch; the height remembered while the block was unsized is the content.
 */
export function heightFitMemory(
  storedHeight: number | null | undefined,
  liveHeight: number,
  rememberedFit: number | null
): number | null {
  if (storedHeight == null && liveHeight > 0) return liveHeight
  return rememberedFit
}

/** The height of `el`'s children, ignoring a pane stretched taller than them. */
export function contentBoxHeight(el: HTMLElement): number {
  const style = getComputedStyle(el)
  const gap = Number.parseFloat(style.rowGap || style.gap) || 0
  const pad =
    (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
  const kids = [...el.children] as HTMLElement[]
  const sum = kids.reduce(
    (total, kid, index) => total + kid.offsetHeight + (index > 0 ? gap : 0),
    0
  )
  return sum + pad
}

/**
 * `fit` is the block's content height. `min` is the fixed chrome plus
 * {@link HEIGHT_BODY_MIN_PX}.
 *
 * A pane stretched by flex reports its own box as the content. When that
 * happens and `rememberedFit` was measured while the block was unsized, that
 * memory is the content height — a chart plot grows with the card, a table
 * does not, and the table path takes the children sum instead.
 */
export function measureBlockHeightBounds(
  root: HTMLElement,
  rememberedFit: number | null
): { fit: number; min: number } {
  const scroller =
    root.querySelector<HTMLElement>('[data-part="plot"]') ??
    root.querySelector<HTMLElement>('[data-part="view-body"]') ??
    root.querySelector<HTMLElement>('[data-part="block-body"]')
  const current = root.offsetHeight
  if (!scroller || scroller.clientHeight === 0) {
    const head = root.querySelector<HTMLElement>('[data-part="block-head"], [data-part="head"]')
    const bar = root.querySelector<HTMLElement>('[data-part="view-chrome"]')
    const card = root.querySelector<HTMLElement>('[data-block-kind]') ?? root
    const style = getComputedStyle(card)
    const pad =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    const chrome = (head?.offsetHeight ?? 0) + (bar?.offsetHeight ?? 0) + pad
    const fit = rememberedFit ?? current
    return {
      fit: Math.max(1, Math.round(fit)),
      min: Math.max(HEIGHT_BODY_MIN_PX, Math.round(chrome + HEIGHT_BODY_MIN_PX)),
    }
  }
  const chrome = Math.max(0, current - scroller.clientHeight)
  const content = contentBoxHeight(scroller)
  const contentFillsPane = Math.abs(content - scroller.clientHeight) <= 1
  const fit = contentFillsPane && rememberedFit != null ? rememberedFit : chrome + content
  return {
    fit: Math.max(1, Math.round(fit)),
    min: Math.max(HEIGHT_BODY_MIN_PX, Math.round(chrome + HEIGHT_BODY_MIN_PX)),
  }
}
