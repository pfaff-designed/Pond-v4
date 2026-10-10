'use client'

/**
 * A page surface's column inside the shell (#96, `Pond 05 Shell`, measured):
 * the content starts 76px from the shell's top (the column's 20px inset + 56px
 * padding) so it sits under the floating breadcrumb pill with air, and the
 * bottom padding is the composer's PUBLISHED footprint + 24, so the last lines
 * (and an open proposal's accept/reject) always have scroll room whatever the
 * drawer's height. Rendered outside a shell (Storybook, a surface alone), there
 * is no pill, so the column starts at the plain 20px inset instead.
 *
 * Owned by the page surface (DocumentPanel) — one column for every page, so
 * pages cannot drift; it also bounds the width handle to
 * the READABLE column with `handle` — it stops where the content stops, never
 * running down through the composer's region.
 */

import type { CSSProperties } from 'react'
import { useCommandFloats } from '@/lib/layout/command-path'
import { composerClearancePadding } from '@/lib/layout/composer-clearance'

export interface SurfaceColumn {
  /** Props for the column wrapper (spread onto the div; add your own data-testid). */
  column: { className: string; style: CSSProperties }
  /** Props for an absolutely positioned right-edge handle bounded to the readable column. */
  handle: { className: string; style: CSSProperties }
}

/** The column's own padding, each side — read wherever a width inside it is worked out. */
export const PAGE_COLUMN_PAD_PX = 32
/** A bare text block's inset, each side (`PondTemplate`: `padding 2px 4px`); the title row aligns to it. */
export const TEXT_BLOCK_INSET_PX = 4

export function useSurfaceColumn(maxWidth: number | string): SurfaceColumn {
  const floats = useCommandFloats()
  const bottom = composerClearancePadding()
  return {
    column: {
      className: `relative mx-auto ${floats ? 'pt-[76px]' : 'pt-5'}`,
      style: { maxWidth, paddingBottom: bottom, paddingInline: PAGE_COLUMN_PAD_PX },
    },
    handle: {
      className: `absolute right-0 ${floats ? 'top-[76px]' : 'top-5'}`,
      style: { bottom },
    },
  }
}
