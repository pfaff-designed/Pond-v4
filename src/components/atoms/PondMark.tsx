/**
 * The pond's own mark — its glyph as a plain mask over `currentColor`, drawn
 * the same way wherever the pond names itself: 13px at the rail head and 12px
 * leading the breadcrumb pill (`Pond 05 Shell`, `PondRail`). One component at
 * two sizes, so the two can never drift apart.
 *
 * Deliberately NOT an `AreaMark`: the pond is not an area, carries no area
 * hue, and is not clickable — so it has no `data-area-mark` slot, and #134's
 * lead crumb mark stays the only one in the trail.
 */

import { Icon } from '@/components/atoms/Icon'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { cn } from '@/lib/utils'

export interface PondMarkProps {
  /** The pond's own glyph (`Pond.glyph`). @default LIFE_GLYPH */
  glyph?: string
  /** Glyph size in px. @default 13 (the rail head); the breadcrumb passes 12. */
  size?: number
  className?: string
}

export function PondMark({ glyph = LIFE_GLYPH, size = 13, className }: PondMarkProps) {
  return (
    <span
      data-pond-mark=""
      aria-hidden="true"
      className={cn('inline-flex flex-none items-center', className)}
    >
      <Icon name={glyph} size={size} />
    </span>
  )
}
