/**
 * Domain logic for creating nodes (Areas, Projects, Routines, Actions).
 * Framework-agnostic — no Next.js imports.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// ── Zod schemas ────────────────────────────────────────────────────────────

const AreaCardSchema = z.object({
  type: z.literal('area'),
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
  AreaCardSchema,
  ProjectCardSchema,
  RoutineCardSchema,
  ActionItemCardSchema,
])

// ── Action Card types (derived from schemas) ───────────────────────────────

export type AreaCard = z.infer<typeof AreaCardSchema>
export type ProjectCard = z.infer<typeof ProjectCardSchema>
export type RoutineCard = z.infer<typeof RoutineCardSchema>
export type ActionItemCard = z.infer<typeof ActionItemCardSchema>

/** Union of all node creation proposals emitted by the AI. */
export type ActionCard = z.infer<typeof ActionCardSchema>

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
  try {
    return ActionCardSchema.parse(JSON.parse(json))
  } catch {
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
