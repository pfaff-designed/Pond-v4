/**
 * Domain logic for creating nodes (Areas, Projects, Routines, Actions).
 * Framework-agnostic — no Next.js imports.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// ── Action Card types ──────────────────────────────────────────────────────

export interface AreaCard {
  type: 'area'
  name: string
}

export interface ProjectCard {
  type: 'project'
  name: string
  area_id?: string
}

export interface RoutineCard {
  type: 'routine'
  name: string
  area_id?: string
}

export interface ActionItemCard {
  type: 'action'
  name: string
  area_id?: string
  project_id?: string
}

/** Union of all node creation proposals emitted by the AI. */
export type ActionCard = AreaCard | ProjectCard | RoutineCard | ActionItemCard

export interface CreatedNode {
  id: string
}

// ── parseActionCard ────────────────────────────────────────────────────────

/**
 * Parse a JSON string (emitted by the AI) into a validated ActionCard.
 * Returns null if the JSON is invalid or doesn't conform to the schema.
 *
 * The AI is expected to emit a JSON block like:
 *   {"type": "area", "name": "Travel"}
 *   {"type": "project", "name": "Website", "area_id": "..."}
 */
export function parseActionCard(json: string): ActionCard | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null

  const obj = parsed as Record<string, unknown>
  const type = obj['type']
  const name = obj['name']

  if (typeof name !== 'string' || !name) return null

  switch (type) {
    case 'area':
      return { type: 'area', name }
    case 'project':
      return {
        type: 'project',
        name,
        area_id: typeof obj['area_id'] === 'string' ? obj['area_id'] : undefined,
      }
    case 'routine':
      return {
        type: 'routine',
        name,
        area_id: typeof obj['area_id'] === 'string' ? obj['area_id'] : undefined,
      }
    case 'action':
      return {
        type: 'action',
        name,
        area_id: typeof obj['area_id'] === 'string' ? obj['area_id'] : undefined,
        project_id: typeof obj['project_id'] === 'string' ? obj['project_id'] : undefined,
      }
    default:
      return null
  }
}

// ── createNode ─────────────────────────────────────────────────────────────

/**
 * Write a node to the correct Supabase table based on the action card type.
 * Follows the Supabase cast pattern established in lib/conversation/client.ts.
 */
export async function createNode(
  supabase: SupabaseClient<Database>,
  card: ActionCard
): Promise<CreatedNode> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  switch (card.type) {
    case 'area': {
      const { data, error } = await sb
        .from('areas')
        .insert({ user_id: user.id, name: card.name })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message ?? 'Failed to create area')
      return { id: data.id as string }
    }

    case 'project': {
      const { data, error } = await sb
        .from('projects')
        .insert({
          user_id: user.id,
          area_id: card.area_id,
          title: card.name,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message ?? 'Failed to create project')
      return { id: data.id as string }
    }

    case 'routine': {
      const { data, error } = await sb
        .from('routines')
        .insert({
          user_id: user.id,
          area_id: card.area_id,
          name: card.name,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message ?? 'Failed to create routine')
      return { id: data.id as string }
    }

    case 'action': {
      const { data, error } = await sb
        .from('actions')
        .insert({
          user_id: user.id,
          title: card.name,
          area_id: card.area_id ?? null,
          project_id: card.project_id ?? null,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message ?? 'Failed to create action')
      return { id: data.id as string }
    }
  }
}
