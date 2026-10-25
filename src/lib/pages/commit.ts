import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { saveBlocks, updateTitle } from './client'
import { recordOwnEdit } from '@/lib/change-log/own-edit'
import { changeLogKey } from '@/lib/change-log/keys'
import { pagesKey } from '@/lib/pages/keys'
import { closeHistoryForBlock } from '@/lib/modules/close-history-for-block'
import { sessionUndo } from '@/lib/change-log/session-undo'
import type { PageWriteOp, PageWriter } from './page-write-queue'

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
type OwnEditOpts = {
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
  /** KAN-368: a caller whose write can race a faster one (the debounced
   *  save, flushed mid-flight by a structural edit) has already reserved
   *  its OWN session-undo slot with `sessionUndo.rememberPending` before
   *  calling this — passing this hands it the record ids once they're
   *  known (null when nothing was logged), instead of `commitBlocks`
   *  remembering a fresh (and, by then, wrongly-ordered) step itself. */
  onPending?: (recordIds: readonly string[] | null) => void
}

export async function commitBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[],
  opts: OwnEditOpts
): Promise<{ remembered: Promise<void> }>
export async function commitBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[],
  opts?: { ownEdit?: false }
): Promise<void>
export async function commitBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[],
  opts: OwnEditOpts | { ownEdit?: false } = {}
): Promise<{ remembered: Promise<void> } | void> {
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
  // The record itself is not awaited HERE: nothing reads it to decide what the
  // page is, so the save reports saved without it, and the log views re-read
  // once it is in. It IS exposed below as `remembered`, for the one caller
  // that does need to wait on it — `use-page-draft.ts`'s `runSave`, so a ⌘Z
  // pressed right after this save finds the record already on the session
  // undo stack (KAN-355) rather than falling through to the previous one.
  if (opts.ownEdit) {
    const { logged } = await recordOwnEdit(supabase, {
      pondId: opts.pondId,
      pageId,
      before: opts.before,
      blocks,
    })
    // Hand `logged` to session-undo BEFORE awaiting anything else on it: a ⌘Z
    // pressed while this is still in flight (the record append races
    // `propagateBlockWrite`'s refetch, and can still be running after the
    // debounce timer that started it has already fired) must wait for THIS
    // `remember` rather than taking the previous step.
    const pondId = opts.pondId
    if (pondId) sessionUndo.trackPending(pondId, logged)
    // Never rejects — a side-record failure must not surface as this save's
    // failure to a caller that awaits `remembered` (use-page-draft's save
    // chain, so a chained save's record is remembered after this one's).
    const remembered: Promise<void> = logged
      .then((record) => {
        if (opts.onPending) opts.onPending(record ? [record.id] : null)
        else if (pondId && record) sessionUndo.remember({ pondId, recordIds: [record.id] })
        // Only now is the record durable enough to hand ⌘Z to the shell's undo
        // (KAN-139, comment 10064) — closing history any earlier (right after
        // `saveBlocks`) leaves a window, until `sessionUndo` hears about the
        // record, where the block reports no undo depth but the shell has
        // nothing to fall through to either, so ⌘Z silently undoes nothing.
        if (record) {
          for (const block of blocks) closeHistoryForBlock(block)
        }
        return queryClient.invalidateQueries({ queryKey: changeLogKey() })
      })
      .catch((err) => {
        // A reserved slot must still settle, or its ⌘Z waits out the timeout.
        opts.onPending?.(null)
        console.error('[change-log] own-edit remember failed', pageId, err)
      })
    await propagateBlockWrite(queryClient, pageId)
    return { remembered }
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
  reembedPage(pageId)
}

/**
 * Fire-and-forget re-embed so semantic retrieval matches the latest content —
 * the half of {@link propagateBlockWrite} that has meaning without a
 * `QueryClient`. Exported so `change-log/answer.ts`'s no-thread accept (no
 * `QueryClient` to invalidate with) shares this call rather than restating it.
 */
export function reembedPage(pageId: string): void {
  // Best-effort. A missing `fetch` (the test runtime) must not reject the
  // save that already landed — the embed is not what the write promised.
  try {
    void fetch('/api/pages/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId }),
    }).catch(() => {})
  } catch {
    // no fetch in this runtime
  }
}

/** A page's title and blocks together — the write queue's stored `T` (KAN-495),
 *  since a 'typed' op's write can carry a rename alongside the block save. */
export type PageWriteState = { title: string; blocks: Block[] }

/**
 * The `page-write-queue`'s writer for a page: one path from an applied op to
 * the database, the change-log record and `sessionUndo`. Delegates the
 * change-log append to `commitBlocks`'s own-edit branch above rather than
 * re-implementing it against `appendOwnEdit` — one home for that logic, not
 * two. A rejected `updateTitle` or `saveBlocks` propagates before either is
 * reached, so a failed write never calls `sessionUndo.trackPending`.
 *
 * Hands `commitBlocks`'s `remembered` to the queue's `settle` side channel
 * rather than awaiting it directly: the write itself (DB + sidebar refresh)
 * is what `head()`/`idle()` should advance on, so `saved` flips the moment
 * the save lands, not once the change-log record is additionally remembered
 * by `sessionUndo` — that stricter wait is `drained()`'s job (KAN-302's
 * `flushNow`), not the queue's own idle/applied notion.
 */
export function createPageWriter(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  pondId: string | null
): PageWriter<PageWriteState> {
  return async (op: PageWriteOp<PageWriteState>, settle?: (promise: Promise<void>) => void) => {
    if (op.kind === 'typed') await updateTitle(supabase, pageId, op.after.title)
    const { remembered } = await commitBlocks(supabase, queryClient, pageId, op.after.blocks, {
      ownEdit: true,
      before: op.before.blocks,
      pondId,
      // KAN-368: a slot reserved at enqueue time. Absent, `commitBlocks`
      // remembers a step itself once the record exists.
      onPending: op.onPending,
    })
    settle?.(remembered)
  }
}
