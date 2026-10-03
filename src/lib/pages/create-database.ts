/**
 * Make a database — the person's own gesture (#280, `Pond 02` 2e `new`: "it is
 * filed in databases; the page it started on gets the view") — framework-agnostic
 * domain logic, the engine under the source picker.
 *
 * One write sequence, one owner: the databases root (created on first use), a
 * collection page under it carrying the schema, and the `view` block the host page
 * swaps in. `list-to-table.ts` (#101) does exactly this before adding the list's
 * rows, so it composes {@link createDatabase} rather than restating the sequence.
 *
 * Direct authoring, not a diff: like #101 and unlike `promote-table.ts` (the AI's
 * proposal, written only on accept), this applies at once with the host's undo —
 * `PROJECT_RULES.md`: pages change through the person's own edits or an accepted
 * diff, and this is the former. No proposal card.
 *
 * The HOST page's block insert is the caller's — the controlled editor owns
 * persistence (see BlockCanvas). No Next.js imports — takes a SupabaseClient,
 * exercised directly in jest against the shared fake.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import type { ViewBlock, ViewMode } from '@/lib/modules/view/schema'
import { createPage, deletePage } from '@/lib/pages/client'
import { getOrCreateDatabasesRoot } from '@/lib/pages/databases-root'
import { withSchema, type PropertySchema } from '@/lib/properties/schema'

export interface CreateDatabaseInput {
  /** The database's title — the picker names it after the page it started on. */
  title: string
  /** Its fields, ids already minted (the 8 property types). */
  schema: PropertySchema
  /** The view the host page gets. @default 'table' */
  mode?: ViewMode
  /** Chart mode's config, when the picker chose a kind. */
  chart?: ViewBlock['chart']
  workspace?: WorkspaceScope
}

export interface CreatedDatabase {
  /** The view block (linked to the database) the host page inserts. */
  view: ViewBlock
  /** The collection page — the new database. */
  databaseId: string
  /** The databases root it was filed under. */
  databasesRootId: string
  /** Whether THIS call created the root (so a rollback may remove it). */
  rootCreated: boolean
}

/**
 * Undo a database's own writes after a failure part-way through, so a stranded
 * half-built database never shows up under databases. Deleting the database page
 * cascades its records (the self-referential FK), and the root goes too only when
 * the same call created it — an older root may hold other databases. Best-effort
 * by design: every error is swallowed so the original failure is what the caller
 * sees, and the worst case is the empty shell the cleanup was meant to remove.
 */
export async function rollbackDatabase(
  supabase: SupabaseClient<Database>,
  databaseId: string | null,
  rootId: string | null
): Promise<void> {
  for (const id of [databaseId, rootId]) {
    if (!id) continue
    try {
      await deletePage(supabase, id)
    } catch {
      // Nothing better to do: the caller's own error is the one worth raising.
    }
  }
}

/**
 * Write an empty database: the root (created on first use) and a collection page
 * under it carrying `schema` — then return the view block that stands in for it on
 * the host page. Throws when unauthenticated, before writing anything, so the
 * editor can leave the page untouched; a failure after the root was made rolls the
 * root back only if this call created it.
 */
export async function createDatabase(
  supabase: SupabaseClient<Database>,
  input: CreateDatabaseInput,
  mintId: () => string
): Promise<CreatedDatabase> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const workspace = input.workspace ?? 'main'
  const root = await getOrCreateDatabasesRoot(supabase, user.id, workspace)
  try {
    const database = await createPage(supabase, user.id, {
      parentId: root.id,
      type: 'page',
      title: input.title,
      props: withSchema({}, input.schema),
      workspace,
    })
    const view: ViewBlock = {
      id: mintId(),
      type: 'view',
      mode: input.mode ?? 'table',
      collectionId: database.id,
      ...(input.chart ? { chart: input.chart } : {}),
    }
    return { view, databaseId: database.id, databasesRootId: root.id, rootCreated: root.created }
  } catch (err) {
    await rollbackDatabase(supabase, null, root.created ? root.id : null)
    throw err
  }
}
