/**
 * The one rule that keeps ponds apart (#312). `Pond 06.13` `s6m5`: "pages,
 * databases, memory, threads and the change log are per pond. Nothing crosses
 * over."
 *
 * Every read of a SET of rows — pages, templates, change-log records, threads —
 * is confined with `inPond`. Reads by id are not: the id names one row already.
 * Readers take the pond as a required argument, so leaving it out cannot compile.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { firstPondId } from './first'

/**
 * The pond a read or write belongs to: the one named, else the person's first —
 * which is also what `?pond=` resolves to on a cold load, so a surface outside the
 * shell's PondProvider agrees with the switcher.
 */
export async function resolvePond(
  supabase: SupabaseClient<Database>,
  userId: string,
  pondId: string | null | undefined
): Promise<string | null> {
  return pondId ?? (await firstPondId(supabase, userId))
}

interface PondFilterable<Q> {
  eq(column: 'pond_id', value: string): Q
  is(column: 'pond_id', value: null): Q
}

/**
 * Confine a query to one pond. With no pond — a person with no pond row yet —
 * only rows that have no pond match, never every pond's. PostgREST matches null
 * with `.is`, not `.eq`.
 */
export function inPond<Q extends PondFilterable<Q>>(query: Q, pond: string | null): Q {
  return pond ? query.eq('pond_id', pond) : query.is('pond_id', null)
}
