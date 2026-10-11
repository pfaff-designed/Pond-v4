'use client'

/**
 * Where the selection bar sits vertically: above the selection, 4px off its
 * rect; just above the composer when that box would overlap it (the bar is
 * z-5, the composer z-30); below the selection when there is no room above;
 * and when below would run under the composer, above again, held to the
 * viewport's top margin. Tracked across
 * scroll and resize as `useAnchoredBox` is, but re-reading the selection's
 * live rect each time, since the selection moves under a scroll.
 */

import { useLayoutEffect, useState, type CSSProperties } from 'react'

import { VIEWPORT_MARGIN, clampLeft } from './use-anchored-box'

/** The gap the bar keeps to the selection, `useAnchoredBox`'s own. */
const SELECTION_GAP = 4

/** The composer card (`TerminalDrawer`), as the DOM names it. */
const COMPOSER_SELECTOR = '[data-part="composer-card"]'

export interface SelectionBox {
  top: number
  bottom: number
  left: number
  width: number
}

export type BarPlacement = 'above' | 'below' | 'clamped'

interface PlaceBarInput {
  rect: Pick<SelectionBox, 'top' | 'bottom'>
  barHeight: number
  viewportHeight: number
  /** The composer's top edge in viewport coordinates; `null` when it is not drawn (zen). */
  composerTop: number | null
}

/** The bar's `top`, and which of the three placements produced it. */
export const placeBarVertically = ({
  rect,
  barHeight,
  viewportHeight,
  composerTop,
}: PlaceBarInput): { placement: BarPlacement; top: number } => {
  const above = rect.top - SELECTION_GAP - barHeight
  const overlapsComposer = composerTop !== null && above + barHeight > composerTop
  if (overlapsComposer) {
    const aboveComposer = composerTop - SELECTION_GAP - barHeight
    return { placement: 'clamped', top: Math.max(aboveComposer, VIEWPORT_MARGIN) }
  }
  if (above >= VIEWPORT_MARGIN) return { placement: 'above', top: above }

  const below = rect.bottom + SELECTION_GAP
  const floor = composerTop ?? viewportHeight - VIEWPORT_MARGIN
  if (below + barHeight <= floor) return { placement: 'below', top: below }

  return { placement: 'clamped', top: VIEWPORT_MARGIN }
}

/** The composer's top edge, or `null` when it is absent or hidden (a `display:none` card has no box). */
export const composerTopEdge = (): number | null => {
  const card = document.querySelector(COMPOSER_SELECTOR)
  if (!card) return null
  const { top, height } = card.getBoundingClientRect()
  return height > 0 ? top : null
}

/** Fixed coordinates for the bar, or `undefined` before there is a selection to sit against. */
export function useSelectionBarBox(
  readRect: (() => SelectionBox) | null,
  width: number,
  height: number
): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    if (!readRect) return
    const update = () => {
      const rect = readRect()
      const { top } = placeBarVertically({
        rect,
        barHeight: height,
        viewportHeight: window.innerHeight,
        composerTop: composerTopEdge(),
      })
      const centred = rect.left + rect.width / 2 - width / 2
      setBox({ top, left: width > 0 ? clampLeft(centred, width, window.innerWidth) : centred })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [readRect, width, height])
  return box
}
