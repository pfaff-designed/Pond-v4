/**
 * An area's glyph in the area's hue (#91) — the `data-area-mark` slot the
 * rail rows, breadcrumb crumbs and the overview kicker all lead with. The slot
 * carries the hue as an inline `color`, so the masked `Icon` inside inherits
 * it through `currentColor` exactly as the retired dot carried it through
 * `background`: area colour tints MARKS only, never text or ground.
 */

import { Icon } from '@/components/atoms/Icon'
import { cn } from '@/lib/utils'

export interface AreaMarkProps {
  /** Glyph name, from `areaGlyph(title)` / `LIFE_GLYPH`. */
  glyph: string
  /** The area hue — a raw accent hex or a colour token expression. */
  color: string
  /** Glyph size in px. @default 13 */
  size?: number
  className?: string
}

export function AreaMark({ glyph, color, size = 13, className }: AreaMarkProps) {
  return (
    <span
      data-area-mark=""
      aria-hidden="true"
      className={cn('inline-flex flex-none items-center', className)}
      style={{ color }}
    >
      <Icon name={glyph} size={size} />
    </span>
  )
}
