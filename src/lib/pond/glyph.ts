'use client'

/**
 * The pond's own glyph — the mark the rail head, the rail root and the
 * breadcrumb pill all lead with. It comes from the pond row; `LIFE_GLYPH` is the
 * fallback outside the shell's `PondProvider` or for a pond that names none.
 */

import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { usePond } from './context'

export function usePondGlyph(): string {
  const { pond } = usePond()
  return pond?.glyph ?? LIFE_GLYPH
}
