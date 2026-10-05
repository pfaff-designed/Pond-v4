'use client'

/**
 * Where a picker's glass sits: fixed coordinates 4px off its anchor's rect —
 * below it, or above it for a composer that sits at the foot of the screen —
 * tracked across scroll and resize. Given the glass's width, its left edge stays
 * 12px inside the viewport, the palette's clamp.
 *
 * The glass portals to `document.body`, so these are viewport coordinates.
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/** All the glass needs of its anchor: an element, or a caret rect standing in for one. */
export interface PickerAnchorBox {
  getBoundingClientRect(): Pick<DOMRect, 'top' | 'bottom' | 'left'>
}
export type PickerAnchor = PickerAnchorBox | null | RefObject<PickerAnchorBox | null>
export type PickerSide = 'top' | 'bottom'

/** The gap the glass keeps to the viewport's left and right edges. */
export const VIEWPORT_MARGIN = 12

/** `left` held to [margin, viewport − width − margin]; a viewport too narrow for the glass keeps the left margin. */
export const clampLeft = (left: number, width: number, viewportWidth: number): number =>
  Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - width - VIEWPORT_MARGIN))

export function useAnchoredBox(
  anchor: PickerAnchor,
  side: PickerSide,
  width = 0
): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    const el = anchor && 'current' in anchor ? anchor.current : anchor
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      const left = width > 0 ? clampLeft(r.left, width, window.innerWidth) : r.left
      setBox(
        side === 'top'
          ? { bottom: window.innerHeight - r.top + 4, left }
          : { top: r.bottom + 4, left }
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, side, width])
  return box
}
