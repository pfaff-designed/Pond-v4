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

/**
 * A text block with no content to type into is furniture, not a block a
 * person put there — same emptiness check `BlockCanvas.tsx`'s own
 * `isBlankBesides` inlines (`b.type === 'text' && b.content.trim() === ''`).
 */
function isEmptyTextBlock(block: unknown): boolean {
  if (typeof block !== 'object' || block === null) return false
  const { type, content } = block as { type?: unknown; content?: unknown }
  return type === 'text' && typeof content === 'string' && content.trim() === ''
}

/** Pure: a page's live block count from its raw `blocks` column value, counting only blocks with content. */
export function blockCount(blocks: unknown): number {
  if (!Array.isArray(blocks)) return 0
  return blocks.filter((block) => !isEmptyTextBlock(block)).length
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
    // `accept.ts`), which invalidates this read along with it. But a saved
    // draft (`use-page-draft.ts`) only ever `setQueryData`s `['page', id]`
    // itself, never this sub-key — so opening the link, editing, and
    // returning to the parent remounts this query (the row unmounted with
    // the parent's canvas while away) while the app-wide 30s `staleTime`
    // (`providers.tsx`) still holds the pre-edit cached value, and react
    // query's default `refetchOnMount` only refetches stale data. `staleTime:
    // 0` + `refetchOnMount: 'always'` (same fix as `PageChangesPanel`'s
    // KAN-303) makes it reread on every mount regardless.
    queryKey: ['page', pageId, 'block-count'] as const,
    queryFn: async () => {
      if (!pageId) return 0
      const supabase = getSupabase()
      const { data } = await supabase.from('pages').select('blocks').eq('id', pageId).maybeSingle()
      return blockCount(data?.blocks)
    },
    enabled: !!pageId,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  return data ?? 0
}
