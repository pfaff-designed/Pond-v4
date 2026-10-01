'use client'

/**
 * A page surface's column inside the shell (#96, `Pond 05 Shell`, measured):
 * the content starts 76px from the shell's top (the column's 20px inset + 56px
 * padding) so it sits under the floating breadcrumb pill with air, and the
 * bottom padding is the composer's PUBLISHED footprint + 24, so the last lines
 * (and an open proposal's accept/reject) always have scroll room whatever the
 * drawer's height. Rendered outside a shell (Storybook, a surface alone), the
 * pill is in the flow, so the column starts at the plain 20px inset instead.
 *
 * Shared by the editor (DocumentPanel) and the overview (OverviewSurface) so
 * the two surfaces cannot drift; the editor also bounds its width handle to
 * the READABLE column with `handle` — it stops where the content stops, never
 * running down through the composer's region.
 */

import type { CSSProperties } from 'react'
import { useBreadcrumbFloats } from '@/lib/layout/breadcrumb-slot'
import { composerClearancePadding } from '@/lib/layout/terminal-height'

export interface SurfaceColumn {
  /** Props for the column wrapper (spread onto the div; add your own data-testid). */
  column: { className: string; style: CSSProperties }
  /** Props for an absolutely positioned right-edge handle bounded to the readable column. */
  handle: { className: string; style: CSSProperties }
}

export function useSurfaceColumn(maxWidth: number | string): SurfaceColumn {
  const floats = useBreadcrumbFloats()
  const bottom = composerClearancePadding()
  return {
    column: {
      className: `relative mx-auto px-8 ${floats ? 'pt-[76px]' : 'pt-5'}`,
      style: { maxWidth, paddingBottom: bottom },
    },
    handle: {
      className: `absolute right-0 ${floats ? 'top-[76px]' : 'top-5'}`,
      style: { bottom },
    },
  }
}
