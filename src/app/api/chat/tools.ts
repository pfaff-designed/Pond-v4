/**
 * Chat tool descriptions + input schemas — the single source of truth for what
 * the model sees when routing. Extracted from route.ts so the routing eval
 * (`scripts/eval-routing.mts`) can import the SAME descriptions and schemas
 * production runs, instead of duplicating them.
 *
 * The route keeps ownership of `fetch_context`'s `execute` closure (it captures
 * the per-request supabase client + user); this module only owns the parts that
 * influence routing — description and inputSchema.
 */
import { z } from 'zod'
import { proposeChangesSchema } from '@/lib/modules/ai-composition'

export const createNodeTool = {
  description:
    'Open the node creation dialog when the user wants to create an area, project, routine, or action. Call this whenever creation intent is detected.',
  inputSchema: z.object({
    type: z.enum(['area', 'project', 'routine', 'action']),
    name: z.string().min(1).describe('The name for the new node'),
  }),
} as const

export const proposeChangesTool = {
  description:
    'Propose a batch of composition changes to the current node — create new blocks, edit existing ones (including changing a block from one type to another), remove blocks, or several at once. Use when the user explicitly asks to build or compose content. The user reviews the proposal (per-change and all-at-once accept/reject) before anything is written. Never propose unprompted. Resolved client-side — no execute. The tool schema is generated from the module registry, so it structurally cannot carry an unknown block type or an id you invented; the emitted data IS the server-side validation gate (t16 branch 7). A repairToolCall pass re-asks you to correct arguments that fail that gate.',
  inputSchema: proposeChangesSchema,
} as const

export const fetchContextTool = {
  description:
    'Search the user\'s entire workspace (all areas, projects, routines, and documents) for content semantically related to a query. Call this ONLY when the user explicitly asks to recall what they wrote before or to bring in context from elsewhere (e.g. "what have I written about X", "pull in my notes on Y"). Never call it to browse unprompted.',
  inputSchema: z.object({
    query: z.string().min(1).describe('What to search the workspace for'),
  }),
} as const
