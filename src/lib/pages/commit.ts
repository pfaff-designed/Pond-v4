import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { saveBlocks } from './client'
import { recordOwnEdit } from '@/lib/change-log/own-edit'
import { changeLogKey } from '@/lib/change-log/keys'
import { pagesKey } from '@/lib/pages/keys'

/**
 * Persist a page's blocks and propagate the write everywhere downstream: refresh
 * the sidebar (pagesKey()) and re-embed the page so semantic retrieval
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
 * The invalidation is deliberately the UNSCOPED `pagesKey()`: react-query matches
 * keys by prefix, so one call refreshes every pond's tree. Narrowing it to the
 * pond would leave another pond's cached tree stale behind a switch.
 */
export async function commitBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[],
  opts:
    | {
        /** The person's OWN typed edit: sweep the page's pending block diffs to
         *  `outdated` once the blocks land, and log the save as one
         *  accepted record by you. The accept path leaves this off — it runs its
         *  own sweep with the accepted record excepted and writes its record
         *  inside `accept_change_log_record`, and an all-skipped accept re-saves
         *  unchanged blocks, which is no edit at all. */
        ownEdit: true
        /** What the page held before this pause — the blocks last saved, or last
         *  adopted from another write. The record's `before`. */
        before: Block[]
        /** The pond the sweep and the record are scoped to. */
        pondId: string | null
      }
    | { ownEdit?: false } = {}
): Promise<void> {
  await saveBlocks(supabase, pageId, blocks)
  // The sweep is a side-record of the save (it never throws) — but it is
  // AWAITED, and it runs BEFORE anything downstream is told the page moved.
  //
  // ORDER HERE IS THE BEHAVIOUR. A diff card learns it has gone outdated by
  // re-reading the log, and that re-read is triggered by the page's blocks
  // changing — `propagateBlockWrite` here, and the caller's own cache reconcile
  // the moment this promise resolves. Firing the sweep with `void`, or after the
  // propagation, races that re-read: the card reads the log before the sweep has
  // written to it, finds the record still `proposed`, and keeps its accept
  // button. That is exactly the state `outdated` exists to prevent.
  //
  // The record itself is not awaited: nothing reads it to decide what the page
  // is, so the save reports saved without it, and the log views re-read once it
  // is in.
  if (opts.ownEdit) {
    const { logged } = await recordOwnEdit(supabase, {
      pondId: opts.pondId,
      pageId,
      before: opts.before,
      blocks,
    })
    void logged.then(() => queryClient.invalidateQueries({ queryKey: changeLogKey() }))
  }
  await propagateBlockWrite(queryClient, pageId)
}

/**
 * Everything that has to happen AFTER a page's blocks land, minus the write
 * itself. Split out because an accepted proposal does not write through
 * `saveBlocks` at all: the page write rides inside `accept_change_log_record` so
 * the commit and the record's advance share one transaction (spec #110 criterion
 * 3). That path still owes the rail a refresh and the index a re-embed, and
 * duplicating them is how the two write paths drift.
 */
export async function propagateBlockWrite(queryClient: QueryClient, pageId: string): Promise<void> {
  // refresh the sidebar so any derived listing reflects the write immediately
  await queryClient.invalidateQueries({ queryKey: pagesKey() })
  // keep semantic retrieval in step with the saved content (best-effort/background)
  void fetch('/api/pages/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId }),
  }).catch(() => {})
}
