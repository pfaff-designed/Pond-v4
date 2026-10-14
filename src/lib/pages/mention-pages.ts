/**
 * Narrowing and ordering for the composer's @ picker (KAN-99). Pure — the
 * picker's own wiring (recent ids, the open references, the typed query)
 * lives in AITerminal.tsx.
 */

import type { PageRow } from './tree'

export interface MentionPageBuckets {
  recentIds: readonly string[]
  linkedIds: readonly string[]
  excludeIds: readonly string[]
}

/**
 * "Linked" (orchestrator decision 4): each ref'd page's parent, plus every
 * page parented under a ref'd page. Order carries no meaning here —
 * `orderMentionPages` re-orders by `pages`' own order.
 */
export function linkedPageIds(pages: PageRow[], refPageIds: readonly string[]): string[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const refSet = new Set(refPageIds)
  const linked = new Set<string>()

  for (const id of refPageIds) {
    const parentId = byId.get(id)?.parent_id
    if (parentId) linked.add(parentId)
  }
  for (const page of pages) {
    if (page.parent_id && refSet.has(page.parent_id)) linked.add(page.id)
  }

  return [...linked]
}

export function orderMentionPages(
  pages: PageRow[],
  { recentIds, linkedIds, excludeIds }: MentionPageBuckets,
  query: string
): PageRow[] {
  const q = query.toLowerCase()
  const excluded = new Set(excludeIds)
  const matches = pages.filter(
    (page) => !excluded.has(page.id) && page.title.toLowerCase().includes(q)
  )
  const byId = new Map(matches.map((page) => [page.id, page]))
  const linkedSet = new Set(linkedIds)
  const placed = new Set<string>()
  const ordered: PageRow[] = []

  for (const id of recentIds) {
    const page = byId.get(id)
    if (!page || placed.has(id)) continue
    ordered.push(page)
    placed.add(id)
  }
  for (const page of matches) {
    if (!linkedSet.has(page.id) || placed.has(page.id)) continue
    ordered.push(page)
    placed.add(page.id)
  }
  for (const page of matches) {
    if (placed.has(page.id)) continue
    ordered.push(page)
    placed.add(page.id)
  }

  return ordered
}
