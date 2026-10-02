/**
 * The `databases` root (#101; `Pond 03 Concepts` 3c: "two roots: life for
 * reading, databases for data").
 *
 * A database made by a user gesture (a list turned into a table, 6j) is filed
 * under this root rather than next to the page it came from — a table is always
 * a view of a database, and the database lives with the other databases. The
 * root is a plain top-level page (no new `type`: #108's rule that structure is
 * never a stored type applies to it too), identified by its reserved title. The
 * sibling-title unique index (#84) guarantees at most one per pond.
 *
 * The two roots are PEERS, so the root is not one of Life's areas on ANY surface.
 * One predicate (`isDatabasesRoot`) answers "is this it", and one filter
 * (`withoutDatabasesRoot`) is applied wherever Life's children are enumerated —
 * the rail's Life tree and the root page's children grid alike — so a
 * page can never read as a root on one surface and an area on another.
 *
 * Framework-agnostic — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { createPage } from '@/lib/pages/client'

/**
 * The reserved title of the databases root page — lowercase, as 3c draws it
 * ("databases", beside "life"). {@link isDatabasesRoot} matches case-insensitively,
 * so a pond whose root was seeded with the old casing still resolves.
 */
export const DATABASES_ROOT_TITLE = 'databases'

/**
 * Is this node the databases root — a TOP-LEVEL page titled "databases"? The one
 * predicate shared by the writer (`getOrCreateDatabasesRoot`) and the rail, so a
 * root the user re-cased is still the root. Shape-typed so a `RailNode`, a
 * `PondPage` or a bare `{ parentId, title }` all fit.
 */
export function isDatabasesRoot(node: { parentId: string | null; title: string }): boolean {
  return (
    node.parentId === null && node.title.trim().toLowerCase() === DATABASES_ROOT_TITLE.toLowerCase()
  )
}

/**
 * {@link isDatabasesRoot} over a flat `['pages']` row (snake_case `parent_id`) —
 * the same predicate, one adapter, so row-shaped callers don't re-spell the rule.
 */
function isDatabasesRootRow(row: { parent_id: string | null; title: string }): boolean {
  return isDatabasesRoot({ parentId: row.parent_id, title: row.title })
}

/**
 * Life's own rows: every page EXCEPT the databases root and its whole subtree.
 *
 * 3c's "one root beside life" means the databases root is a PEER of life, not one
 * of its areas — so every surface that enumerates Life's children (the rail's
 * Life tree and the root page's children grid, which read the same rows)
 * must subtract it. Applying it here, once, is what
 * keeps the two surfaces from disagreeing. The root's own page still reads
 * normally when opened — it is a page with pages inside it.
 */
export function withoutDatabasesRoot<
  T extends { id: string; parent_id: string | null; title: string },
>(rows: readonly T[]): T[] {
  const root = rows.find(isDatabasesRootRow)
  if (!root) return [...rows]
  const childrenOf = new Map<string, T[]>()
  for (const row of rows) {
    if (!row.parent_id) continue
    const siblings = childrenOf.get(row.parent_id)
    if (siblings) siblings.push(row)
    else childrenOf.set(row.parent_id, [row])
  }
  const excluded = new Set<string>([root.id])
  const queue = [root.id]
  while (queue.length > 0) {
    for (const child of childrenOf.get(queue.pop() as string) ?? []) {
      if (excluded.has(child.id)) continue // cycle guard on malformed data
      excluded.add(child.id)
      queue.push(child.id)
    }
  }
  return rows.filter((r) => !excluded.has(r.id))
}

/**
 * The user's databases root in this workspace, created on first use. Reads the
 * top-level pages and matches with {@link isDatabasesRoot}; absent one, creates
 * it (the only moment the pond "has one to list", so the rail draws it from then
 * on). `created` lets a caller know the rail gained a root, not just a child.
 */
export async function getOrCreateDatabasesRoot(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspace: WorkspaceScope = 'main'
): Promise<{ id: string; created: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pages')
    .select('id, title')
    .eq('user_id', userId)
    .eq('workspace', workspace)
    .is('parent_id', null)
  if (error) throw new Error(error.message)

  const existing = ((data ?? []) as { id: string; title: string }[]).find((r) =>
    isDatabasesRoot({ parentId: null, title: r.title })
  )
  if (existing) return { id: existing.id, created: false }

  const root = await createPage(supabase, userId, {
    parentId: null,
    type: 'page',
    title: DATABASES_ROOT_TITLE,
    workspace,
  })
  return { id: root.id, created: true }
}
