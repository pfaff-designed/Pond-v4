/**
 * The mark write path: a page's glyph, and an area's colour role.
 *
 * A mark write does not stamp `updated_at`: a mark is not a content or name edit,
 * and `subtreeLatest` reads `updated_at` as the page's last edit. A failed mark
 * write throws; it is what the person asked for, never a side-record.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { AreaRole } from '@/lib/rail/glyph-library'
import { DATABASES_ROOT_TITLE } from './databases-root'
import { HOME_TYPE } from './home'

/** Set a page's glyph, or null to put its automatic mark back. Any page takes one. */
export const setPageGlyph = async (
  supabase: SupabaseClient<Database>,
  id: string,
  glyph: string | null
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('pages').update({ glyph }).eq('id', id)
  if (error) throw error
}

const AREA_ROLE_CHECK = 'pages_area_role_area_only'

/** Thrown when a colour is written to a page that is not an area. */
export class NotAnAreaError extends Error {
  constructor(id: string) {
    super(`Only an area takes a colour; page ${id} is not one.`)
    this.name = 'NotAnAreaError'
  }
}

/**
 * Set an area's colour role, or null for ink. Written as a ROLE, never a colour
 * (`glyph-library.ts`). Only an area takes one (`isArea` in `mark.ts`); the
 * filter matches nothing for any other page, and `pages_area_role_area_only`
 * refuses what the filter cannot see (a title padded with whitespace). Both
 * surface as `NotAnAreaError`.
 */
export const setAreaRole = async (
  supabase: SupabaseClient<Database>,
  areaId: string,
  role: AreaRole | null
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pages')
    .update({ area_role: role })
    .eq('id', areaId)
    .is('parent_id', null)
    .neq('type', HOME_TYPE)
    .not('title', 'ilike', DATABASES_ROOT_TITLE)
    .select('id')
  if (error?.code === '23514' && error.message?.includes(AREA_ROLE_CHECK)) {
    throw new NotAnAreaError(areaId)
  }
  if (error) throw error
  if (!data || data.length === 0) throw new NotAnAreaError(areaId)
}
