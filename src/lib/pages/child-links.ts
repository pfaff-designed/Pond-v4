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

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import { blockSchema, type Block } from '@/lib/modules/content'
import {
  getPage,
  mapRow,
  saveProps,
  PAGE_COLUMNS,
  type PondPage,
  type PageRow as PondPageRow,
} from './client'
import { commitBlocks } from './commit'
import { restorePage, trashPage } from '@/lib/change-log/trash'
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

/** Validates one `RemovedLink` read back off `props.unlinkedLinks` jsonb — reuses
 *  `content.ts`'s own `blockSchema` for `block` rather than re-describing a
 *  page-link block's shape a second time (AGENTS.md DRY). */
const removedLinkSchema = z.object({
  parentId: z.string(),
  block: blockSchema,
  index: z.number(),
  beforeId: z.string().nullable(),
})

/**
 * Parse `props.unlinkedLinks` at the read boundary, dropping any entry that
 * doesn't validate rather than failing the whole array — a page's `props` is
 * hand-editable jsonb, so one corrupt entry must not block every other
 * parent's pending relink.
 */
function parseUnlinkedLinks(value: unknown): RemovedLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const parsed = removedLinkSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * Read a page's `props` jsonb, throwing on a read error rather than
 * `getPage`'s swallow-to-`null` (KAN-448) — every caller here merges onto
 * whatever this returns and writes the merge back, so a transient read
 * failure silently treated as "no props" would wipe the page's real props
 * (`status`, `_schema`, `mark`, `childLinksMigrated`, ...) on write. A `null`
 * row with no error (missing, or RLS-hidden) throws too, for the same
 * reason: `readMergeWriteProps`'s write must never run against a row that
 * was never actually read.
 */
async function readPageProps(
  supabase: SupabaseClient<Database>,
  pageId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('pages')
    .select('props')
    .eq('id', pageId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data === null) throw new Error(`page ${pageId} not found while reading props`)
  const current = (data as { props?: unknown }).props
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {}
}

/** The one read-merge-write seam for a page's `props`, shared by every caller
 *  in this file that needs to touch `props` without clobbering a sibling key
 *  (`unlinkTrashedSubtree`, `relinkRestoredSubtree`, `markChildLinksMigrated`). */
async function readMergeWriteProps(
  supabase: SupabaseClient<Database>,
  pageId: string,
  merge: (props: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
  const props = await readPageProps(supabase, pageId)
  await saveProps(supabase, pageId, merge(props))
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
 * `pageIds`. Includes a match whose own id is in `pageIds` (e.g. an ancestor
 * linking its own child inside the same to-be-trashed subtree) — this
 * function doesn't know which ids are a "subtree", so `unlinkTrashedSubtree`
 * is the one that filters those back out. Trashed rows are already invisible
 * here: the SELECT policy hides a trashed row even from its own owner
 * (`trash.ts`), so no extra status filter is needed.
 *
 * One `.contains('blocks', ...)` query per id rather than one combined OR —
 * chaining `.contains()` on a single builder ANDs the filters, which is the
 * wrong shape here. `pageIds` is always a handful at most (one subtree), so
 * the fan-out stays cheap; a page linked to more than one id in the set comes
 * back from more than one of these queries and is deduped by id below.
 *
 * The containment value is passed as a JSON string, not the JS array
 * literal: postgrest-js only serialises an array argument as a Postgres
 * array literal (`cs.{...}`), which Postgres then rejects against a `jsonb`
 * column with "invalid input syntax for type json" — no link is ever found,
 * let alone removed.
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
      const { data, error } = await inPond(q, pondId).contains(
        'blocks',
        JSON.stringify([{ type: 'page-link', pageId }])
      )
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
 * before the caller trashes that subtree (KAN-448). `findPagesLinkingTo`'s
 * matches are filtered to drop any id already in `subtreeIds` — a page
 * inside the subtree being trashed is never edited by this ticket, even when
 * it links one of its own descendants. Each remaining parent goes through
 * the exact same own-edit seam as `appendChildLinkToParent` — flush
 * its pending save, read it fresh (the earlier `findPagesLinkingTo` read ran
 * before the flush and may already be stale), write only if the fresh read
 * still has the link, invalidate.
 *
 * Each parent's removal is append-merged onto `rootPageId`'s own
 * `props.unlinkedLinks` BEFORE that parent is committed, not collected and
 * written once at the end — so an earlier parent's already-landed removal is
 * never lost if a LATER parent's commit (or the root write itself) throws.
 * `restoreLinks` already refuses to double-apply an entry whose link is
 * still present, so recording a parent that then fails to commit is
 * harmless over-recording, not a correctness bug.
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
    const parents = (await findPagesLinkingTo(supabase, pondId, subtreeIds)).filter(
      (parent) => !subtreeIds.has(parent.id)
    )

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

      if (parentRemoved.length > 0) {
        await readMergeWriteProps(supabase, rootPageId, (props) => ({
          ...props,
          unlinkedLinks: [...parseUnlinkedLinks(props.unlinkedLinks), ...parentRemoved],
        }))
      }

      await commitBlocks(supabase, queryClient, parent.id, nextBlocks, {
        ownEdit: true,
        before: fresh.blocks,
        pondId,
      })
      await queryClient.invalidateQueries({ queryKey: ['page', parent.id] })
    }
  } catch (err) {
    console.error('[page-link] trashed subtree not unlinked', rootPageId, err)
  }
}

/**
 * Undo `unlinkTrashedSubtree`'s write, once the subtree is restored (KAN-448).
 * Reads `rootPageId`'s `props.unlinkedLinks` through {@link readPageProps}
 * (throws on a read error rather than silently treating it as "no props" and
 * later wiping the root's real props on write) and {@link parseUnlinkedLinks}
 * (drops any entry that fails `removedLinkSchema` rather than failing the
 * whole array). Absent or empty → no-op, then
 * replays each entry's parent through the same own-edit seam: flush that
 * parent's pending save (the same race `unlinkTrashedSubtree` guards against
 * — a restore can land while the parent is the open, actively-saving page),
 * read it fresh, `restoreLinks`, commit only if that actually changed the
 * blocks, invalidate. Entries are grouped by `parentId` first so two links
 * restoring onto the same page commit once, in their original relative
 * order, not twice.
 *
 * `props.unlinkedLinks` is cleared once every entry has been attempted,
 * success or not — a parent that's since vanished or already carries the
 * link is as "done" as one that was freshly restored, and leaving the field
 * behind would replay it again next restore.
 *
 * Never throws: a failed relink must not fail the restore it rides with
 * (`unlinkTrashedSubtree`'s rule) — log and return.
 */
export async function relinkRestoredSubtree(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  { pondId, rootPageId }: { pondId: string | null; rootPageId: string }
): Promise<void> {
  try {
    const props = await readPageProps(supabase, rootPageId)
    const removed = parseUnlinkedLinks(props.unlinkedLinks)
    if (removed.length === 0) return

    const byParent = new Map<string, RemovedLink[]>()
    for (const entry of removed) {
      const entries = byParent.get(entry.parentId) ?? []
      entries.push(entry)
      byParent.set(entry.parentId, entries)
    }

    for (const [parentId, entries] of byParent) {
      await flushPendingPageSave(parentId)
      const parent = await getPage(supabase, parentId)
      if (!parent) continue

      const nextBlocks = restoreLinks(parent.blocks, entries)
      if (nextBlocks === parent.blocks) continue

      await commitBlocks(supabase, queryClient, parentId, nextBlocks, {
        ownEdit: true,
        before: parent.blocks,
        pondId,
      })
      await queryClient.invalidateQueries({ queryKey: ['page', parentId] })
    }

    const restProps = { ...props }
    delete restProps.unlinkedLinks
    await saveProps(supabase, rootPageId, restProps)
  } catch (err) {
    console.error('[page-link] restored subtree not relinked', rootPageId, err)
  }
}

/**
 * The one seam both Rail call sites use to trash a subtree (KAN-448): unlink
 * it, trash it, and — if `trashPage` itself throws (network, a
 * `TrashRefusedError`) — relink what was just unlinked before rethrowing, so
 * a caller's own failure handling (the rail's "Couldn't delete" + restored
 * row) is never left facing a live page whose links are gone and a
 * `props.unlinkedLinks` nobody will ever clear. The two call sites had
 * drifted to calling `unlinkTrashedSubtree`/`trashPage` separately, with one
 * passing only the node's own id as `subtreeIds` rather than its whole live
 * subtree — this seam gives them no way to drift again.
 */
export async function trashPageUnlinked(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  {
    pondId,
    rootPageId,
    subtreeIds,
  }: { pondId: string | null; rootPageId: string; subtreeIds: Set<string> }
): Promise<void> {
  await unlinkTrashedSubtree(supabase, queryClient, { pondId, rootPageId, subtreeIds })
  try {
    await trashPage(supabase, rootPageId)
  } catch (err) {
    await relinkRestoredSubtree(supabase, queryClient, { pondId, rootPageId })
    throw err
  }
}

/**
 * The one home for restore-then-relink (KAN-451): `restorePage` writes the
 * `restore` record, then `relinkRestoredSubtree` puts back whatever
 * `trashPageUnlinked` unlinked from the subtree's root on its way into trash.
 * Both `TrashPage.tsx` and `ChangeLogPage.tsx` call this rather than each
 * calling `restorePage` and `relinkRestoredSubtree` separately — the two
 * had drifted once already (TrashPage shipped without the relink step).
 * `rootPageId` is `null` when the restored record never had a target page;
 * relink is then a no-op rather than a call with nothing to relink.
 */
export async function restorePageRelinked(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  { pondId, recordId, rootPageId }: { pondId: string | null; recordId: string; rootPageId: string | null }
): Promise<void> {
  await restorePage(supabase, recordId)
  if (rootPageId) {
    await relinkRestoredSubtree(supabase, queryClient, { pondId, rootPageId })
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
  const props = await readPageProps(supabase, pageId)
  if (props.childLinksMigrated === true) return
  await saveProps(supabase, pageId, { ...props, childLinksMigrated: true })
}
