/**
 * Appends a page-link block to a parent's blocks (KAN-415). `appendChildLink`
 * is pure — no React, no Supabase — so the one rule ("never a second link to
 * the same child") is unit-testable without a page or a client.
 * `appendChildLinkToParent` is the write seam every non-open-page caller
 * (rail add-child, make-this-a-page, reparent) shares, so that rule can't
 * drift between them. `childLinkTargets` + `markChildLinksMigrated` back the
 * one-time upgrade for a page that already had children before this ticket
 * (DocumentPanel, the currently-open page, so IT goes through its own
 * `commitLocalEdit` rather than this module's write seam).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/modules/content'
import { getPage, mapRow, PAGE_COLUMNS, type PondPage, type PageRow as PondPageRow } from './client'
import { commitBlocks } from './commit'
import type { PageRow } from './tree'
import { withoutDatabasesRoot } from './databases-root'
import { flushPendingPageSave } from './page-flush'
import { sortedChildIds } from '@/lib/rail/tree'
import { homeQueryKey } from './keys'
import { getOrCreateHomePage, type HomePage } from './home'
import { inPond } from '@/lib/pond/scope'

/**
 * Append a page-link to `childId` at the end of `blocks`, unless one already
 * exists anywhere in the array — then `blocks` is returned unchanged (same
 * reference), so a caller can tell "nothing to write" from "wrote a block".
 */
export function appendChildLink(blocks: Block[], childId: string): Block[] {
  const hasLink = blocks.some((block) => block.type === 'page-link' && block.pageId === childId)
  if (hasLink) return blocks
  return [...blocks, { id: crypto.randomUUID(), type: 'page-link', pageId: childId }]
}

/**
 * Read-merge-write a page-link onto `parentId`'s blocks for a parent that is
 * NOT the open page (rail add-child, make-this-a-page, reparent) — so it goes
 * through the DB rather than the editor's local draft. A no-op, with no
 * write, when the parent doesn't exist or already links `childId`;
 * `appendChildLink` is what decides that, so the two paths can't drift.
 *
 * Invalidates `['page', parentId]` rather than `setQueryData`s it, matching
 * `commit.ts`'s documented convention for an external write: an open draft on
 * that page adopts the new blocks via `use-page-draft.ts`'s same-page adopt
 * branch instead of having them silently overwritten.
 *
 * Flushes `parentId`'s own pending debounced save first (a no-op when
 * nothing is pending) — otherwise a read right after typing on the open
 * parent races its 600ms save, and that save lands after this write and
 * overwrites the appended link with the stale blocks it was holding.
 */
export async function appendChildLinkToParent(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  parentId: string,
  childId: string,
  pondId: string | null
): Promise<void> {
  await flushPendingPageSave(parentId)
  const parent = await getPage(supabase, parentId)
  if (!parent) return

  const nextBlocks = appendChildLink(parent.blocks, childId)
  if (nextBlocks === parent.blocks) return

  await commitBlocks(supabase, queryClient, parentId, nextBlocks, {
    ownEdit: true,
    before: parent.blocks,
    pondId,
  })
  await queryClient.invalidateQueries({ queryKey: ['page', parentId] })
}

/**
 * Every call site that creates or moves a page under a `parentId` that may be
 * `null` (top-level) shares this: resolve `null` to the home row (the cache
 * first, `getOrCreateHomePage` as the fallback), then append the link — and
 * swallow failure rather than throw, since a failed link append must never
 * fail the page create/move it rides along with (every caller's own rule).
 */
export async function appendChildLinkUnder(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  parentId: string | null,
  childId: string,
  pondId: string | null,
  pondName: string
): Promise<void> {
  try {
    const resolvedParentId =
      parentId ??
      queryClient.getQueryData<HomePage | null>(homeQueryKey(pondId))?.id ??
      (await getOrCreateHomePage(supabase, pondId, pondName))?.id ??
      null
    if (!resolvedParentId) return
    await appendChildLinkToParent(supabase, queryClient, resolvedParentId, childId, pondId)
  } catch (err) {
    console.error('[page-link] child link not appended', childId, err)
  }
}

/**
 * The ids of a page's direct children, in the rail's own order — the same
 * scope the deleted `childCards` used (root scoped via `withoutDatabasesRoot`
 * when `parentId` is null — the home row's children are the top-level pages),
 * sorted by `rail/tree.ts`'s own `sortedChildIds` so "rail order" can't drift
 * between the rail and this upgrade. Pure, so the one-time upgrade's "which
 * children get a link" rule is unit-testable without a page or a client.
 */
export function childLinkTargets(rows: PageRow[], parentId: string | null): string[] {
  const scope = parentId === null ? withoutDatabasesRoot(rows) : rows
  return sortedChildIds(scope, parentId)
}

/** A page-link block removed from one parent, enough to put it back (KAN-448). */
export interface RemovedLink {
  parentId: string
  block: Block
  index: number
  beforeId: string | null
}

/**
 * Strip every page-link block whose `pageId` is in `pageIds` from `blocks`,
 * recording each removal's position so `restoreLinks` can put it back later.
 * `parentId` is stamped onto every `RemovedLink` since the pure core doesn't
 * know which page it was called on — callers collect these across several
 * parents (KAN-448's `unlinkTrashedSubtree`). No match returns the same
 * `blocks` reference, mirroring `appendChildLink`'s no-op rule.
 */
export function removeLinksTo(
  blocks: Block[],
  pageIds: Set<string>,
  parentId: string
): { blocks: Block[]; removed: RemovedLink[] } {
  const removed: RemovedLink[] = []
  const next: Block[] = []
  blocks.forEach((block, index) => {
    if (block.type === 'page-link' && pageIds.has(block.pageId)) {
      removed.push({ parentId, block, index, beforeId: index === 0 ? null : blocks[index - 1].id })
      return
    }
    next.push(block)
  })
  if (removed.length === 0) return { blocks, removed }
  return { blocks: next, removed }
}

/**
 * Pure reinsert for `removeLinksTo`'s output (KAN-448). Each `RemovedLink` is
 * replayed in order: skip if a link to that page already exists anywhere
 * (`appendChildLink`'s no-duplicate rule); else reinsert right after the
 * saved `beforeId` if it's still present — a neighbour id survives reordering
 * elsewhere on the page, so this is the main branch even when the link
 * itself was moved before its parent was trashed; else fall back to the
 * saved `index`, clamped to the current length, when `beforeId` is `null`
 * or its block is gone.
 */
export function restoreLinks(blocks: Block[], removed: RemovedLink[]): Block[] {
  return removed.reduce((current, entry) => {
    const pageId = entry.block.type === 'page-link' ? entry.block.pageId : null
    const hasLink = current.some((block) => block.type === 'page-link' && block.pageId === pageId)
    if (hasLink) return current

    const beforeIndex =
      entry.beforeId === null ? -1 : current.findIndex((block) => block.id === entry.beforeId)
    const insertAt =
      beforeIndex === -1 ? Math.min(Math.max(entry.index, 0), current.length) : beforeIndex + 1
    return [...current.slice(0, insertAt), entry.block, ...current.slice(insertAt)]
  }, blocks)
}

/**
 * Every LIVE page in `pond` whose `blocks` jsonb links to any id in
 * `pageIds` (KAN-448: `pageIds` is a trashed subtree, so a page inside that
 * subtree is never a caller-meaningful parent — descendants aren't edited by
 * this ticket). Trashed rows are already invisible here: the SELECT policy
 * hides a trashed row even from its own owner (`trash.ts`), so no extra
 * status filter is needed.
 *
 * One `.contains('blocks', ...)` query per id rather than one combined OR —
 * chaining `.contains()` on a single builder ANDs the filters, which is the
 * wrong shape here. `pageIds` is always a handful at most (one subtree), so
 * the fan-out stays cheap; a page linked to more than one id in the set comes
 * back from more than one of these queries and is deduped by id below.
 */
export async function findPagesLinkingTo(
  supabase: SupabaseClient<Database>,
  pondId: string | null,
  pageIds: Set<string>
): Promise<PondPage[]> {
  if (pageIds.size === 0) return []

  const byId = new Map<string, PondPage>()
  await Promise.all(
    [...pageIds].map(async (pageId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = (supabase as any).from('pages').select(PAGE_COLUMNS)
      const { data, error } = await inPond(q, pondId).contains('blocks', [
        { type: 'page-link', pageId },
      ])
      if (error) throw new Error(error.message)
      for (const row of (data ?? []) as PondPageRow[]) {
        if (!byId.has(row.id)) byId.set(row.id, mapRow(row))
      }
    })
  )
  return [...byId.values()]
}

/**
 * Unlink every LIVE page outside the subtree that links into it, right
 * before the caller trashes that subtree (KAN-448). Each matched parent goes
 * through the exact same own-edit seam as `appendChildLinkToParent` — flush
 * its pending save, read it fresh (the earlier `findPagesLinkingTo` read ran
 * before the flush and may already be stale), write only if the fresh read
 * still has the link, invalidate. Every removal across every parent is
 * flattened onto `rootPageId`'s own `props.unlinkedLinks` — a plain
 * read-merge-write, same shape as `markChildLinksMigrated` — written BEFORE
 * returning, so the caller can sequence `trashPage` right after: a trashed
 * row is RLS-hidden to everyone, including its own owner, so this must land
 * first.
 *
 * Never throws: a failed unlink must not fail the trash it rides with
 * (`appendChildLinkUnder`'s rule) — log and return.
 */
export async function unlinkTrashedSubtree(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  {
    pondId,
    rootPageId,
    subtreeIds,
  }: { pondId: string | null; rootPageId: string; subtreeIds: Set<string> }
): Promise<void> {
  try {
    const parents = await findPagesLinkingTo(supabase, pondId, subtreeIds)
    const removed: RemovedLink[] = []

    for (const parent of parents) {
      await flushPendingPageSave(parent.id)
      const fresh = await getPage(supabase, parent.id)
      if (!fresh) continue

      const { blocks: nextBlocks, removed: parentRemoved } = removeLinksTo(
        fresh.blocks,
        subtreeIds,
        parent.id
      )
      if (nextBlocks === fresh.blocks) continue

      await commitBlocks(supabase, queryClient, parent.id, nextBlocks, {
        ownEdit: true,
        before: fresh.blocks,
        pondId,
      })
      await queryClient.invalidateQueries({ queryKey: ['page', parent.id] })
      removed.push(...parentRemoved)
    }

    if (removed.length === 0) return

    const { data } = await supabase
      .from('pages')
      .select('props')
      .eq('id', rootPageId)
      .maybeSingle()
    const current = (data as { props?: unknown } | null)?.props
    const props: Record<string, unknown> =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('pages')
      .update({ props: { ...props, unlinkedLinks: removed }, updated_at: new Date().toISOString() })
      .eq('id', rootPageId)
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('[page-link] trashed subtree not unlinked', rootPageId, err)
  }
}

/**
 * Stamp `props.childLinksMigrated` on the `['page', pageId]` query cache, so
 * the upgrade effect's own-page cache read sees the stamp at once rather than
 * only after `markChildLinksMigrated`'s DB write resolves — otherwise a
 * navigate-away-and-back while that write is still in flight (or already
 * landed but unrefetched) re-reads an unstamped cached page and re-appends a
 * link the person just removed. No-op when the page isn't in the cache.
 */
export function stampChildLinksMigratedInCache(queryClient: QueryClient, pageId: string): void {
  queryClient.setQueryData(['page', pageId], (prev: PondPage | null | undefined) =>
    prev ? { ...prev, props: { ...prev.props, childLinksMigrated: true } } : prev
  )
}

/**
 * Stamp `props.childLinksMigrated` on the open page itself, once its current
 * children have each been given a page-link block (KAN-415's one-time
 * upgrade) — read-merge-write on `props`, exactly like `nested-page.ts`'s
 * `markOpened`, so the schema and every other prop are untouched. No-op once
 * the stamp is already there, so a reload never re-runs the upgrade.
 */
/**
 * Await a pending save before stamping — the one-time upgrade's appended
 * links only reach the DB through the open page's own 600ms-debounced save
 * (`flushPendingPageSave`), so stamping before that save lands would leave a
 * reload within the debounce window with the stamp but none of the links it
 * promises. A rejected `flush` propagates and the stamp never runs.
 */
export async function saveThenStamp({
  flush,
  stamp,
}: {
  flush: () => Promise<void> | undefined
  stamp: () => Promise<void>
}): Promise<void> {
  await flush()
  await stamp()
}

export async function markChildLinksMigrated(
  supabase: SupabaseClient<Database>,
  pageId: string
): Promise<void> {
  const { data } = await supabase.from('pages').select('props').eq('id', pageId).maybeSingle()
  const current = (data as { props?: unknown } | null)?.props
  const props: Record<string, unknown> =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {}
  if (props.childLinksMigrated === true) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ props: { ...props, childLinksMigrated: true }, updated_at: new Date().toISOString() })
    .eq('id', pageId)
  if (error) throw new Error(error.message)
}
