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
import { proposeChangesSchema, moduleDataSchema } from '@/lib/modules/ai-composition'

/**
 * create_page (M1) — the single merged create gesture for the chat AI. It mints a
 * BRAND-NEW page (separate from the one the user is on) and scaffolds its initial
 * content in one step. Both structural types (project/area/routine/action) AND
 * content pages go through it and get real scaffolded content.
 *
 * Client-resolved (no execute): the tool call renders a proposal card, the user
 * reviews + optionally corrects placement, and only on accept does the client mint
 * block ids and write. `blocks` reuses the registry-derived, id-stripped
 * `moduleDataSchema` so this tool cannot drift from the block registry and cannot
 * carry an id the model invented. Placement is proposed by title (`parentTitle`);
 * the client resolves it and lets the user change it.
 */
export const createPageTool = {
  description:
    'Create a BRAND-NEW page (separate and distinct from the page the user is currently on) and scaffold its initial content blocks in one step — a project, area, routine, action, recipe, document, inventory/collection, dashboard, or any new page. Use this whenever the user asks to create/make/start a new page or node, whether structural (a project, an area) or content (a recipe, a document). This is DISTINCT from propose_changes, which only edits the CURRENT page. Client-resolved (no execute): the user reviews a proposal card and can correct the placement before anything is written; do NOT re-ask for confirmation. Scaffold the blocks so the page is genuinely useful the moment it is created — real content, checklists for any steps or tasks, and never dead all-zero metrics.',
  inputSchema: z.object({
    type: z
      .enum(['area', 'routine', 'project', 'action', 'page'])
      .describe(
        'The page type tag. Use a structural type for a project/area/routine/action; use "page" for any content page (recipe, document, inventory, dashboard, note).'
      ),
    kind: z
      .string()
      .optional()
      .describe(
        'The page-kind for a content page (e.g. recipe, document, inventory, dashboard, note). Omit for a structural type.'
      ),
    title: z.string().min(1).describe('A clear title for the new page.'),
    parentTitle: z
      .string()
      .optional()
      .describe(
        'The title of the page/area this new page should live under. Use the title the user named (e.g. "in my Personal area"); when they name none, infer the most fitting parent from the current node and the workspace outline in context. Omit ONLY when the user asks for a top-level page or no existing page plausibly fits.'
      ),
    blocks: z
      .array(moduleDataSchema)
      .describe(
        'The scaffolded initial content, composed only from the available block types. Give the page real, useful content — not an empty shell.'
      ),
    reason: z
      .string()
      .optional()
      .describe(
        'A short, optional note on what this page is for (shown to the user on the proposal card).'
      ),
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
