import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { saveBlocks } from './client'

/**
 * Persist a page's blocks and propagate the write everywhere downstream: refresh
 * the sidebar (['pages', workspace]) and re-embed the page so semantic retrieval
 * matches the latest content. This is the shared tail behind BOTH the
 * DocumentPanel debounced save and the accepted-AI-edit (diff-card) write path
 * — extract-to-one so the two can't drift.
 *
 * The ['page', pageId] cache is deliberately NOT touched here — callers own it,
 * because the correct behaviour differs by origin: an own-save reconciles the
 * cache in place via setQueryData (so it doesn't clobber unsaved local edits),
 * whereas an external write (accepted proposal) invalidates it to force the open
 * panel to adopt the new blocks.
 *
 * ticket-43: workspace scopes the query-key invalidation so sandbox saves only
 * refresh the sandbox rail, and main saves only refresh the main rail.
 */
export async function commitBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[],
  workspace: WorkspaceScope = 'main'
): Promise<void> {
  await saveBlocks(supabase, pageId, blocks)
  await propagateBlockWrite(queryClient, pageId, workspace)
}

/**
 * Everything that has to happen AFTER a page's blocks land, minus the write
 * itself. Split out because an accepted proposal does not write through
 * `saveBlocks` at all: the page write rides inside `accept_change_log_record` so
 * the commit and the record's advance share one transaction (spec #110 criterion
 * 3). That path still owes the rail a refresh and the index a re-embed, and
 * duplicating them is how the two write paths drift.
 */
export async function propagateBlockWrite(
  queryClient: QueryClient,
  pageId: string,
  workspace: WorkspaceScope = 'main'
): Promise<void> {
  // refresh the sidebar so any derived listing reflects the write immediately
  await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
  // keep semantic retrieval in step with the saved content (best-effort/background)
  void fetch('/api/pages/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId }),
  }).catch(() => {})
}
