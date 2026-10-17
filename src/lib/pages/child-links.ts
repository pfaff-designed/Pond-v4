/**
 * Appends a page-link block to a parent's blocks (KAN-415). `appendChildLink`
 * is pure — no React, no Supabase — so the one rule ("never a second link to
 * the same child") is unit-testable without a page or a client.
 * `appendChildLinkToParent` is the write seam every non-open-page caller
 * (rail add-child, make-this-a-page, reparent) shares, so that rule can't
 * drift between them.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/modules/content'
import { getPage } from './client'
import { commitBlocks } from './commit'

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
 */
export async function appendChildLinkToParent(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  parentId: string,
  childId: string,
  pondId: string | null
): Promise<void> {
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
