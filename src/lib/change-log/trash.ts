/**
 * Trash and restore as change-log records (KAN-97) — the calls into
 * `trash_page` / `restore_page` (migration 0027).
 *
 * Each RPC stamps or clears `deleted_at` across a page's whole subtree and
 * writes its own `delete` / `restore` record, all or nothing — the write
 * side lives entirely in SQL. A refusal comes back as a reason read off the
 * DETAIL, the same way `undo.ts` reads its own, but mapped straight to a
 * `TrashRefusedError` (through `errors.ts`'s `personFacingMessage`) rather
 * than a result union: a caller here just wants to try the call and show a
 * line, not branch on stale/blocked/refused the way session undo does. An
 * error whose DETAIL this module doesn't recognize — the network, most
 * likely — is rethrown unchanged, because that call may still succeed.
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js and no React.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { TrashRefusedError, type TrashRefusalReason } from './errors'

/** `restore_page` (0027) falls back to the pond root when the original
 *  parent is itself trashed or gone — one home for the notice line, read by
 *  every surface that offers restore (`ChangeLogPage`, `TrashPage`). */
export const PARENT_FALLBACK_LINE = 'put back at the top of the pond — its old place is gone'

const TRASH_REFUSAL_REASONS: readonly TrashRefusalReason[] = [
  'not-found',
  'page-gone',
  'already-restored',
  'not-trashable',
]

const isTrashRefusalReason = (value: string): value is TrashRefusalReason =>
  (TRASH_REFUSAL_REASONS as readonly string[]).includes(value)

/** `trash_page`, `restore_page` and `pages_existing` aren't in the
 *  generated `Database` types (neither is `accept_revert_record`, which
 *  `revert.ts` calls the same way) — cast at the call site rather than
 *  widening `SupabaseClient`'s own type. */
const rpc = (supabase: SupabaseClient<Database>, fn: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).rpc(fn, args) as Promise<{ data: unknown; error: PostgrestError | null }>

const run = async (
  supabase: SupabaseClient<Database>,
  fn: 'trash_page' | 'restore_page',
  args: Record<string, unknown>
): Promise<unknown> => {
  const { data, error } = await rpc(supabase, fn, args)
  if (error === null) return data
  const reason = error.details ?? ''
  if (isTrashRefusalReason(reason)) throw new TrashRefusedError(reason, error.message)
  throw error
}

/** Trash a page and its whole subtree in one stamp, logging one `delete` record. */
export const trashPage = async (supabase: SupabaseClient<Database>, pageId: string): Promise<void> => {
  await run(supabase, 'trash_page', { p_page_id: pageId })
}

/** Restore the subtree a `delete` record trashed, logging one `restore` record —
 *  resolves to the new `restore` record's own id (0037), for session undo to remember. */
export const restorePage = (supabase: SupabaseClient<Database>, recordId: string): Promise<string> =>
  run(supabase, 'restore_page', { p_record_id: recordId }) as Promise<string>

/** Which of `pageIds` still exist as rows at all (trashed or live) — the deleted
 *  view's only way to tell "still in trash" from "emptied" now that part 2's
 *  SELECT policy hides a trashed row even from its own owner. */
export const existingPageIds = async (
  supabase: SupabaseClient<Database>,
  pageIds: readonly string[]
): Promise<Set<string>> => {
  if (pageIds.length === 0) return new Set()
  const { data, error } = await rpc(supabase, 'pages_existing', { p_page_ids: pageIds })
  if (error) throw error
  return new Set((data as string[] | null) ?? [])
}
