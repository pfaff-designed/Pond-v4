'use client'

/**
 * Where a picker's glass sits: fixed coordinates 4px off its anchor's rect —
 * below it, or above it for a composer that sits at the foot of the screen —
 * tracked across scroll and resize. The engine logic the `/` menu (#278) already
 * had; lifted here so the source picker (#280) hangs off the same hook rather
 * than a second copy.
 *
 * The glass portals to `document.body`, so these are viewport coordinates.
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export type PickerAnchor = Element | null | RefObject<Element | null>
export type PickerSide = 'top' | 'bottom'

export function useAnchoredBox(anchor: PickerAnchor, side: PickerSide): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    const el = anchor && 'current' in anchor ? anchor.current : anchor
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setBox(
        side === 'top'
          ? { bottom: window.innerHeight - r.top + 4, left: r.left }
          : { top: r.bottom + 4, left: r.left }
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, side])
  return box
}
