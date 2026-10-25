/**
 * KAN-468 / AUDIT G9: the one flow both ⌘K's "duplicate page" and ⌘D on a
 * focused rail row run. Split out of `tree.ts` (a pure cache module — `keys.ts`
 * warns that suites mock `@/lib/pages/tree` with a partial factory) since this
 * one calls the RPC, flushes a pending save and navigates.
 */

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { homeQueryKey, resolveLinkParentId } from './keys'
import type { HomePage } from './home'
import { flushPendingPageSave } from './page-flush'
import { duplicatePage } from './client'
import { afterDuplicate } from './tree'
import { openWorkspaceUrl, workspaceUrl, type WorkspaceNavRouter } from './nav'

/** AUDIT G9: one duplicate in flight at a time per pond — a second call for
 *  the same pond (a held ⌘D that slips past the `repeat` guard on some
 *  platform, or a fast double ↵ on ⌘K's "duplicate page" row) is dropped
 *  rather than racing a second `duplicatePage` against the same siblings. */
const duplicatesInFlight = new Set<string>()

/**
 * Get the user, flush the link parent's own pending save, call `duplicatePage`,
 * run `afterDuplicate`, then open the copy under ITS OWN title. A failure is
 * logged, then reported through the caller's own notice mechanism (Rail's
 * toast vs. the composer's), with one shared message.
 *
 * `parentId` is the page being duplicated's OWN `parentId` (not yet resolved to
 * a link row) — the caller already has it from the same cached row it read
 * `id`/`fallback` off, so this never issues a second fetch for it. Resolved to
 * the link row the RPC is about to write to (0032: a duplicate's root keeps its
 * source's parent, so the page-link it appends lands on the SAME row a move's
 * own link edit would) via `resolveLinkParentId`, falling back to the pond's
 * home row when there is no parent. That row's pending debounced save is
 * flushed BEFORE the RPC runs — otherwise a save mid-debounce on that page
 * (typing in "Kitchen" while duplicating one of its children) can land AFTER
 * the RPC's own write and erase the link it just appended.
 */
export async function duplicateAndOpen(
  queryClient: QueryClient,
  router: WorkspaceNavRouter,
  pondId: string | null,
  id: string,
  parentId: string | null,
  fallback: { type: string; title: string },
  notify: (message: string) => void
): Promise<void> {
  const lockKey = pondId ?? ''
  if (duplicatesInFlight.has(lockKey)) return
  duplicatesInFlight.add(lockKey)
  try {
    const homeId = queryClient.getQueryData<HomePage>(homeQueryKey(pondId))?.id
    const linkParentId = resolveLinkParentId(parentId, homeId)
    await flushPendingPageSave(linkParentId)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const record = await duplicatePage(supabase, user.id, id)
    const copyId = record.targetPageId
    if (!copyId) return
    afterDuplicate(queryClient, record, pondId)
    openWorkspaceUrl(workspaceUrl({ id: copyId, type: fallback.type, title: record.title }), router)
  } catch (err) {
    console.error(err)
    notify("can't duplicate the page — try again.")
  } finally {
    duplicatesInFlight.delete(lockKey)
  }
}
