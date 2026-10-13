'use client'

/**
 * Whether the signed-in person's empty-shell hints should still show
 * (`Pond 06.04` 6d frame 2): true while `users.first_run_done_at` is null,
 * false once it's set. SELECT-only, matching the narrowed users policy (0012)
 * — this hook only ever reads the flag; `mark_first_run_done()` is the one
 * door that sets it (`lib/pages/make-page.ts`).
 *
 * Nothing invalidates `FIRST_RUN_QUERY_KEY` when the flag is set — `make-page.ts`
 * is framework-agnostic and never touches the query client. Instead this query
 * runs with `staleTime: 0` and exposes `refetch`, so the caller (`DocumentPanel`,
 * on the root being re-entered) reads the flag fresh rather than the cache.
 */
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'

export const FIRST_RUN_QUERY_KEY = ['first-run-done-at'] as const

export function useFirstRunPending(): { pending: boolean; refetch: () => void } {
  const getSupabase = useLazySupabase()
  const { data, refetch } = useQuery({
    queryKey: FIRST_RUN_QUERY_KEY,
    staleTime: 0,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const { data: row, error } = await supabase
        .from('users')
        .select('first_run_done_at')
        .eq('id', user.id)
        .single()
      // A failed read must never read as pending — only a CONFIRMED null flag
      // shows the hints.
      if (error) throw error
      return row?.first_run_done_at ?? null
    },
  })
  // Unresolved (`undefined` — still loading, signed-out, or errored) reads as
  // "not pending" — the hints only ever appear once the flag is confirmed null.
  return { pending: data === null, refetch: () => void refetch() }
}
