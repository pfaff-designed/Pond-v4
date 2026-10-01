/**
 * The Life home page (ticket-44).
 *
 * The Life root is now a REAL page that holds its own blocks — a reserved,
 * per-user row of the `home` type (top-level, one per user; see migration 0005).
 * Its blocks render above the areas grid on the Life overview, with the full
 * editor (the `/` palette, `+` insert, reorder, bound metrics), and Pond can
 * compose them through the normal propose_changes gate (the row is a real page,
 * so it appears in the workspace outline and `targetPageId` reaches it).
 *
 * It must NOT appear as a rail child or inflate the areas overview counts. That
 * is enforced at ONE read boundary — `fetchPages` (lib/pages/tree.ts) strips the
 * home row from the `['pages']` cache the rail and overview surfaces read — so
 * every UI-tree consumer excludes it with no per-site guard. The home row is
 * reached only through this module (`getOrCreateHomePage`) and the AI outline.
 *
 * Framework-agnostic — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'

/** The reserved page type that marks the Life home row. */
export const HOME_TYPE = 'home' as const

/** The Life home page: its id (so the editor can save to it) and its blocks. */
export interface HomePage {
  id: string
  title: string
  blocks: Block[]
}

/** Blocks are stored as jsonb; coerce anything non-array to []. */
function toBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : []
}

/**
 * Fetch the current user's Life home row, creating it on first access. Idempotent:
 * the partial unique index (`pages_one_home_per_user`) makes a concurrent second
 * insert fail, in which case we re-read the winner — so two tabs opening Life at
 * once never leave two home rows. Returns null only when unauthenticated.
 *
 * The row is created empty (no seeded blocks): an untouched Life shows just the
 * overview + the add affordance (ticket-44 §1), never phantom content.
 */
export async function getOrCreateHomePage(
  supabase: SupabaseClient<Database>
): Promise<HomePage | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const existing = await readHomeRow(supabase, user.id)
  if (existing) return existing

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('pages')
    .insert({
      user_id: user.id,
      parent_id: null,
      type: HOME_TYPE,
      // Lowercase, like every other page name Pond writes (#101 review): the rail
      // and the breadcrumb render a title raw, and the AI reads this one in the
      // workspace outline. A pond created before this keeps 'Life' until the
      // one-off row correction lands (gated, batched with migration 0017).
      title: 'life',
      blocks: [],
      props: {},
    })
    .select('id, title, blocks')
    .single()

  if (error || !data) {
    // Lost the create race (unique index) or a transient failure — re-read the
    // winning row. If that also comes back empty, surface null rather than throw
    // so the Life overview still renders (just without an editable home surface).
    return readHomeRow(supabase, user.id)
  }

  return {
    id: data.id as string,
    title: (data.title as string) ?? 'life',
    blocks: toBlocks(data.blocks),
  }
}

/** Read the user's existing home row, or null if none exists yet. */
async function readHomeRow(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<HomePage | null> {
  const { data } = await supabase
    .from('pages')
    .select('id, title, blocks')
    .eq('user_id', userId)
    .eq('type', HOME_TYPE)
    .is('parent_id', null)
    .limit(1)
    .maybeSingle()

  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  return {
    id: row.id as string,
    title: (row.title as string) ?? 'life',
    blocks: toBlocks(row.blocks),
  }
}
