/**
 * The page-kind mark (#91) — a 7×7px, 2px-radius square in a muted ink or an
 * area accent. Pond codes page kinds with a shape and a colour where another
 * system would reach for a symbol (handoff readme §3); area glyphs are the
 * other register (`Icon`), and the two never mix. Extracted from
 * PondMolecule's inline `kindDot` helper so the rail and cards share one mark.
 * (The overview kicker's fallback square is still its own inline span, and
 * PondAtom's `dot` kind is a fourth copy — both are follow-ups, not this one.)
 *
 * Colour rule: an `accent` (a raw hex from the page-accent set) applies as an
 * inline background and REPLACES the muted class — marks only, never text or
 * ground. Variant classes (a selected `bg-mn-text`, an area role `bg-mn-area-a`,
 * a smaller `size-1.5`) merge through `className`; tailwind-merge collapses
 * the conflicting default.
 */

import { cn } from '@/lib/utils'

export interface KindDotProps {
  /** Raw area accent hex; when set it paints the dot and drops the muted class. */
  accent?: string
  className?: string
}

export function KindDot({ accent, className }: KindDotProps) {
  return (
    <span
      data-part="dot"
      aria-hidden="true"
      className={cn(
        'inline-block size-[7px] flex-none rounded-mn-hair',
        !accent && 'bg-mn-text/50',
        className
      )}
      style={accent ? { background: accent } : undefined}
    />
  )
}
