/**
 * The person's first pond, in switcher order (#312).
 *
 * The fallback for a reader or writer that does not know which pond it is in.
 * With no `?pond=` the active pond IS the first one, so this agrees with the
 * switcher on a cold load; where a surface does know, it passes the pond
 * explicitly and this is never reached.
 *
 * Returns null before migration 0018 is applied, when `ponds` does not exist —
 * callers then behave exactly as they did before ponds.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

interface LiveFilterable<Q> {
  is(column: 'deleted_at', value: null): Q
}

/** Confine a `ponds` select to live (not soft-deleted) rows — KAN-493's
 *  `deleted_at`. The one filter `listPonds` (`@/lib/pond/client`) and
 *  `firstPondId` both apply, so a reader can't forget it the way `firstPondId`
 *  itself once did (KAN-493: deleting your only pond left this fallback
 *  returning it anyway). */
export function liveOnly<Q extends LiveFilterable<Q>>(query: Q): Q {
  return query.is('deleted_at', null)
}

export async function firstPondId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  // Returns null on ANY failure rather than throwing. This is a fallback, and the
  // three ways it legitimately fails all mean the same thing — "no pond scope" —
  // which is the behaviour every caller had before ponds existed:
  //   * migration 0018 not applied: PostgREST answers PGRST205;
  //   * no session, or a person with no pond row yet;
  //   * a caller holding a narrow test double whose builder has no `.order`.
  // Throwing here would turn a missing fallback into a failed page read.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ponds = (supabase as any).from('ponds').select('id').eq('user_id', userId)
    const { data } = await liveOnly(ponds).order('order').limit(1).maybeSingle()
    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}
