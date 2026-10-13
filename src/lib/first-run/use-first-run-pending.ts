'use client'

/**
 * Whether the signed-in person's empty-shell hints should still show
 * (`Pond 06.04` 6d frame 2): true while `users.first_run_done_at` is null,
 * false once it's set. SELECT-only, matching the narrowed users policy (0012)
 * — this hook only ever reads the flag; `mark_first_run_done()` is the one
 * door that sets it (`lib/pages/make-page.ts`).
 *
 * `FIRST_RUN_QUERY_KEY` is exported so the write side can invalidate it once
 * the flag is set, without a reload.
 */
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'

export const FIRST_RUN_QUERY_KEY = ['first-run-done-at'] as const

export function useFirstRunPending(): boolean {
  const getSupabase = useLazySupabase()
  const { data } = useQuery({
    queryKey: FIRST_RUN_QUERY_KEY,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const { data: row } = await supabase
        .from('users')
        .select('first_run_done_at')
        .eq('id', user.id)
        .single()
      return row?.first_run_done_at ?? null
    },
  })
  // Unresolved (`undefined`) reads as "not pending" — the hints only ever
  // appear once the flag is confirmed null, never during the first load.
  return data === null
}
