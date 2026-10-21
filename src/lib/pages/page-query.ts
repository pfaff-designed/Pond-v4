/**
 * The one `['page', id]` query definition (KAN-388). `DocumentPanel`'s
 * `useQuery` and every hover/focus/active-row prefetch (`queryClient.prefetchQuery`)
 * share this so the key and the fetcher can never drift apart — a prefetch
 * under a different key would warm a cache entry `useQuery` never reads.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getPage } from './client'

export function pageQueryOptions(getSupabase: () => SupabaseClient<Database>, id: string | null) {
  return {
    queryKey: ['page', id] as const,
    queryFn: () => (id ? getPage(getSupabase(), id) : Promise.resolve(null)),
  }
}
