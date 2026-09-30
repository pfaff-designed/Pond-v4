/**
 * Domain logic for creating nodes (Pages, Projects, Routines, Actions).
 * Framework-agnostic — no Next.js imports.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { createPage } from '@/lib/pages/client'

// ── Zod schemas ────────────────────────────────────────────────────────────

// #108: the old 'area' card is gone — an area is just a page that has pages
// inside it, so a life domain lifted out of a transcript ("travel", "health") is
// created as a plain top-level page and becomes an area as things land in it.
const PageCardSchema = z.object({
  type: z.literal('page'),
  name: z.string().min(1),
})

const ProjectCardSchema = z.object({
  type: z.literal('project'),
  name: z.string().min(1),
  area_id: z.string().optional(),
})

const RoutineCardSchema = z.object({
  type: z.literal('routine'),
  name: z.string().min(1),
  area_id: z.string().optional(),
})

const ActionItemCardSchema = z.object({
  type: z.literal('action'),
  name: z.string().min(1),
  area_id: z.string().optional(),
  project_id: z.string().optional(),
})

const ActionCardSchema = z.discriminatedUnion('type', [
  PageCardSchema,
  ProjectCardSchema,
  RoutineCardSchema,
  ActionItemCardSchema,
])

// ── Action Card types (derived from schemas) ───────────────────────────────

export type PageCard = z.infer<typeof PageCardSchema>
export type ProjectCard = z.infer<typeof ProjectCardSchema>
export type RoutineCard = z.infer<typeof RoutineCardSchema>
export type ActionItemCard = z.infer<typeof ActionItemCardSchema>

/** Union of all node creation proposals emitted by the AI. */
export type ActionCard = z.infer<typeof ActionCardSchema>

export interface CreatedNode {
  id: string
}

// ── UUID validation ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve a parent reference that may be a UUID or a page title, to a page id.
 *  ticket-43: the title lookup is scoped to `workspace` so a sandbox parent
 *  title resolves against sandbox rows only (a UUID needs no scope — it's exact). */
export async function resolveParentId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string,
  idOrName: string,
  workspace: WorkspaceScope = 'main'
): Promise<string> {
  if (UUID_RE.test(idOrName)) return idOrName
  const { data, error } = await sb
    .from('pages')
    .select('id')
    .eq('user_id', userId)
    .eq('workspace', workspace)
    .ilike('title', idOrName)
    .limit(1)
    .maybeSingle()
  if (error || !data) throw new Error(`Page "${idOrName}" not found`)
  return data.id as string
}

// ── parseActionCard ────────────────────────────────────────────────────────

/**
 * Parse a JSON string (emitted by the AI) into a validated ActionCard.
 * Returns null if the JSON is invalid or doesn't conform to the schema.
 *
 * The AI is expected to emit a JSON block like:
 *   {"type": "page", "name": "Travel"}
 *   {"type": "project", "name": "Website", "area_id": "..."}
 */
export function parseActionCard(json: string): ActionCard | null {
  try {
    return ActionCardSchema.parse(JSON.parse(json))
  } catch {
    return null
  }
}

// ── createNode ─────────────────────────────────────────────────────────────

/**
 * Create a node from an AI action card. In the unified model every node is a
 * page: the card `type` becomes the page's kind tag, and the card's parent
 * reference (area_id / project_id) becomes the page's parent_id. A bare `page`
 * card carries no parent reference, so it lands top-level — which is where a
 * life domain belongs, and it becomes an area as pages are nested under it
 * (#108). Delegates the insert to pages/client.createPage.
 */
export async function createNode(
  supabase: SupabaseClient<Database>,
  card: ActionCard,
  workspace: WorkspaceScope = 'main'
): Promise<CreatedNode> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Determine the parent page. Actions prefer their project, then area.
  let parentRef: string | undefined
  if (card.type === 'project' || card.type === 'routine') parentRef = card.area_id
  else if (card.type === 'action') parentRef = card.project_id ?? card.area_id

  const parentId = parentRef ? await resolveParentId(sb, user.id, parentRef, workspace) : null

  const page = await createPage(supabase, user.id, {
    parentId,
    type: card.type,
    title: card.name,
    workspace,
  })
  return { id: page.id }
}
