import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { saveBlocks } from './client'

/**
 * Persist a page's blocks and propagate the write everywhere downstream: refresh
 * the sidebar (['pages']) and re-embed the page so semantic retrieval matches the
 * latest content. This is the shared tail behind BOTH the DocumentPanel debounced
 * save and the accepted-AI-edit (diff-card) write path — extract-to-one so the two
 * can't drift.
 *
 * The ['page', pageId] cache is deliberately NOT touched here — callers own it,
 * because the correct behaviour differs by origin: an own-save reconciles the
 * cache in place via setQueryData (so it doesn't clobber unsaved local edits),
 * whereas an external write (accepted proposal) invalidates it to force the open
 * panel to adopt the new blocks.
 */
export async function commitBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[]
): Promise<void> {
  await saveBlocks(supabase, pageId, blocks)
  // refresh the sidebar so any derived listing reflects the write immediately
  await queryClient.invalidateQueries({ queryKey: ['pages'] })
  // keep semantic retrieval in step with the saved content (best-effort/background)
  void fetch('/api/pages/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId }),
  }).catch(() => {})
}
