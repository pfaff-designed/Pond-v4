'use client'

/**
 * Live `N blocks` for a page-link row (KAN-122). Never stored — re-read on
 * demand, one lightweight per-link query selecting just the linked page's
 * `blocks` column (not the whole-subtree count `child-cards.ts` computes).
 *
 * No `jsonb_array_length(...)` computed-column select: PostgREST has no bare
 * function-call select syntax without a migration, and this ticket has none
 * budgeted. `.length` is measured client-side instead.
 */
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'

/** Pure: a page's live block count from its raw `blocks` column value. */
export function blockCount(blocks: unknown): number {
  return Array.isArray(blocks) ? blocks.length : 0
}

/** Live block count for `pageId`, or 0 while unresolved/loading. */
export function useBlockCount(pageId: string | undefined): number {
  // Lazily created on first fetch, not at render — so an envless mount
  // (Storybook, the AI terminal's reference render) never constructs a real
  // client and throws.
  const getSupabase = useLazySupabase()

  const { data } = useQuery({
    // A sub-key of `['page', pageId]` — renaming/editing the linked page
    // already invalidates that prefix (`use-capabilities.ts`'s `renamePage`,
    // `accept.ts`), which invalidates this read along with it.
    queryKey: ['page', pageId, 'block-count'] as const,
    queryFn: async () => {
      if (!pageId) return 0
      const supabase = getSupabase()
      const { data } = await supabase.from('pages').select('blocks').eq('id', pageId).maybeSingle()
      return blockCount(data?.blocks)
    },
    enabled: !!pageId,
  })

  return data ?? 0
}
