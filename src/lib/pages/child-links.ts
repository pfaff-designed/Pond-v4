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
import { getPage, type PondPage } from './client'
import { commitBlocks } from './commit'
import type { PageRow } from './tree'
import { withoutDatabasesRoot } from './databases-root'
import { flushPendingPageSave } from './page-flush'

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
 * The ids of a page's direct children, in the rail's own order — the same
 * scope and order the deleted `childCards` used (direct children, root scoped
 * via `withoutDatabasesRoot` when `parentId` is null — the home row's
 * children are the top-level pages). Pure, so the one-time upgrade's "which
 * children get a link" rule is unit-testable without a page or a client.
 */
export function childLinkTargets(rows: PageRow[], parentId: string | null): string[] {
  const scope = parentId === null ? withoutDatabasesRoot(rows) : rows
  return scope
    .filter((r) => r.parent_id === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
    .map((r) => r.id)
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
