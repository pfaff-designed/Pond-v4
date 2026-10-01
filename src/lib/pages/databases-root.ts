/**
 * The `databases` root (#101; `Pond 03 Concepts` 3c: "two roots: life for
 * reading, databases for data").
 *
 * A database made by a user gesture (a list turned into a table, 6j) is filed
 * under this root rather than next to the page it came from — a table is always
 * a view of a database, and the database lives with the other databases. The
 * root is a plain top-level page (no new `type`: #108's rule that structure is
 * never a stored type applies to it too), identified by its reserved title. The
 * sibling-title unique index (#84) guarantees at most one per pond, and the rail
 * reads the same predicate (`isDatabasesRoot`) to draw it at its foot.
 *
 * Framework-agnostic — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { createPage } from '@/lib/pages/client'

/** The reserved title of the databases root page. */
export const DATABASES_ROOT_TITLE = 'Databases'

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
