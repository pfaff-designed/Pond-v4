/**
 * Appends a page-link block to a parent's blocks (KAN-415). Pure — no React,
 * no Supabase — so the one rule ("never a second link to the same child") is
 * unit-testable without a page or a client.
 */

import type { Block } from '@/lib/modules/content'

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
