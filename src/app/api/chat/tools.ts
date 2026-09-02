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
import { proposeChangesSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import { isTitleEchoHeading, TITLE_ECHO_MESSAGE } from '@/lib/modules/authoring-lint'
import { askQuestionSchema, suggestFollowupsSchema } from '@/lib/conversation/parts'
import { aiPropertyDefSchema } from '@/lib/properties/schema'

// The web_search tool (ticket-29) lives in ./web-search so this routing-schema
// module — imported by lint tests and the eval in a jsdom environment — stays free
// of the heavy `@ai-sdk/anthropic` import (which needs Web streams globals).

/**
 * create_page input schema, with the ticket-21 title-echo lint attached at the
 * whole-object level (it needs both `title` and the first block). Rejecting a
 * first-block heading that repeats the page title triggers `repairToolCall`, which
 * re-asks the model to drop that heading — the corrective message names the fix.
 * Scoped to create_page: this is the "AI-created page opens with `## <title>`"
 * anti-pattern from the audit; propose_changes carries no page title to compare.
 */
const createPageInput = z
  .object({
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
      .array(createPageBlockSchema)
      .describe(
        'The scaffolded initial content, composed only from the available block types. Give the page real, useful content — not an empty shell. Do NOT make the first block a heading that repeats the page title; the title is already shown. ' +
          'To scaffold a LIVE metric over a checklist/table in this same list, put `bindKey: "<key>"` on that checklist/table entry and `source: { ref: "<key>", kind }` on the metric (ids are minted on accept — never invent blockIds here).'
      ),
    reason: z
      .string()
      .optional()
      .describe(
        'A short, optional note on what this page is for (shown to the user on the proposal card).'
      ),
  })
  .superRefine((input, ctx) => {
    const first = input.blocks[0]
    if (first?.type === 'text' && isTitleEchoHeading(first.content, input.title)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: TITLE_ECHO_MESSAGE,
        path: ['blocks', 0, 'content'],
      })
    }
  })

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
    'Create a BRAND-NEW page (separate and distinct from the page the user is currently on) and scaffold its initial content blocks in one step — a project, area, routine, action, recipe, document, inventory/collection, dashboard, or any new page. Use this whenever the user asks to create/make/start a new page or node, whether structural (a project, an area) or content (a recipe, a document). This is DISTINCT from propose_changes, which only edits the CURRENT page. Client-resolved (no execute): the user reviews a proposal card and can correct the placement before anything is written; do NOT re-ask for confirmation. Scaffold the blocks so the page is genuinely useful the moment it is created — real content, checklists for any steps or tasks, and never dead all-zero metrics. Do NOT open the page with a heading block that repeats the page title (the title is already shown), and put any tabular data in a `table` module — never a markdown pipe table inside a text block.',
  inputSchema: createPageInput,
} as const

/**
 * define_schema input schema (#17 slice 5). The model names an EXISTING page by
 * id and proposes the ordered list of typed properties that turns it into a
 * collection. `properties` reuses the AI-facing `aiPropertyDefSchema`, where each
 * property/option `id` is OPTIONAL — the model never mints the stable ids a
 * rename relies on; the client mints any missing id on accept (exactly like block
 * ids in create_page).
 */
const defineSchemaInput = z.object({
  pageId: z
    .string()
    .min(1)
    .describe(
      'The id of the EXISTING page to give a property schema to, taken verbatim from the [Workspace outline] in context. Never invent an id.'
    ),
  properties: z
    .array(aiPropertyDefSchema)
    .min(1)
    .describe(
      'The ordered typed properties (columns) for this collection — each a { name, type } with type one of text | number | date | select | status | checkbox | relation. Give a select/status property its `options` (each an { label }); do NOT supply ids (the client mints them on accept).'
    ),
  reason: z
    .string()
    .optional()
    .describe('A short, optional note on what this schema is for (shown on the proposal card).'),
})

/**
 * define_schema (#17) — turn an EXISTING page into a collection by giving it a
 * typed property schema (the #18 primitive). Client-resolved (no execute): the
 * tool call renders a proposal card, the user reviews the columns and can correct
 * the target page, and only on accept does the client mint ids and write via the
 * merge-safe `defineSchema` (existing row values are never clobbered). DISTINCT
 * from propose_changes (which edits a page's content blocks) — this defines the
 * page's property columns.
 */
export const defineSchemaTool = {
  description:
    'Give an EXISTING page a typed property SCHEMA — the set of columns (name + type) that turns it into a collection/database. Use this when the user asks to turn a page into a table/database/tracker, to add properties/columns/fields to a page, or to define what fields its items should have (e.g. "turn my reading list into a database with Status and Rating", "add a due-date and priority to this tracker"). Name the target page by its id from the [Workspace outline]; propose the ordered properties (each a name + one of the 7 types, with options for select/status). This is DISTINCT from propose_changes, which edits a page\'s content blocks — define_schema defines its property columns. Client-resolved (no execute): the user reviews a proposal card and can correct which page it applies to before anything is written; do NOT re-ask for confirmation. Do NOT invent property or option ids — the client mints them on accept. One schema per card.',
  inputSchema: defineSchemaInput,
} as const

export const proposeChangesTool = {
  description:
    'Propose a batch of composition changes to an EXISTING page — create new blocks, edit existing ones (including changing a block from one type to another), remove blocks, or several at once. Edits the page the user has open by default; to edit ANOTHER page they named, first read_page that page and set `targetPageId` to its id (from the [Workspace outline]). Use when the user explicitly asks to build or compose content (never to create a brand-new page — that is create_page). The user reviews the proposal (per-change and all-at-once accept/reject) before anything is written. Never propose unprompted. Resolved client-side — no execute. The tool schema is generated from the module registry, so it structurally cannot carry an unknown block type or an id you invented; the emitted data IS the server-side validation gate (t16 branch 7). A repairToolCall pass re-asks you to correct arguments that fail that gate.',
  inputSchema: proposeChangesSchema,
} as const

export const fetchContextTool = {
  description:
    'Search the user\'s entire workspace (all areas, projects, routines, and documents) for content semantically related to a query. Call this ONLY when the user explicitly asks to recall what they wrote before or to bring in context from elsewhere (e.g. "what have I written about X", "pull in my notes on Y"). Never call it to browse unprompted.',
  inputSchema: z.object({
    query: z.string().min(1).describe('What to search the workspace for'),
  }),
} as const

/**
 * read_page (ticket-30) — fetch one page's current blocks BY ID so the model can
 * propose a correct cross-page edit to a page that is NOT the one open. The user's
 * open page is auto-injected already; this is for editing ANOTHER page the user
 * named. Server-executed (the route owns the closure that captures the per-request
 * supabase client + user): the model calls read_page with an id copied from the
 * [Workspace outline], reads back the page's title/type and its blocks WITH ids,
 * then emits a propose_changes batch whose `targetPageId` is that same id and whose
 * edit/remove/after references use those block ids. Never guess ids — read first.
 */
export const readPageTool = {
  description:
    'Read one page by its id — its title, type, and its editable blocks WITH their ids — so you can propose a correct edit to a page the user named that is NOT the page currently open. Copy the id verbatim from the [Workspace outline] in context; never invent one. Call this BEFORE a cross-page propose_changes so your block references resolve against that page. Do not call it for the page already open (its blocks are already in context) or to browse unprompted.',
  inputSchema: z.object({
    pageId: z
      .string()
      .min(1)
      .describe(
        'The id of the page to read, taken verbatim from the [Workspace outline] in context'
      ),
  }),
} as const

/**
 * ask_question (ticket-39, THE SPINE) — a BRANCH-PAUSE question card. During
 * build-out, when you reach a decision that is the USER's to make, emit this
 * INSTEAD of guessing or stopping: a question + 2-4 option chips + a free answer.
 * It blocks ONLY its own branch — keep scaffolding the rest of the structure and
 * apply the answered branch when the user picks. Client-resolved (no execute):
 * the tool call renders the card; the user's pick rides the resolutions envelope
 * so the card renders inert after reload and the answer reaches you next turn.
 * Do NOT use this to defer an ordinary edit or to re-ask something already
 * answered — only for genuine user-owned forks in a build-out.
 */
export const askQuestionTool = {
  description:
    'Ask the user a single branch-pause QUESTION when a build-out reaches a decision that is theirs to make (e.g. which kiln type, which budget tier). Emit a clear question + 2-4 option chips + let them type a free answer. This BLOCKS ONLY THAT BRANCH — continue scaffolding everything else and apply their answer when they pick. Client-resolved (no execute); do NOT re-ask a question the user has already answered, and do NOT use it to stall on a change you can just propose.',
  inputSchema: askQuestionSchema,
} as const

/**
 * suggest_followups (ticket-39, THE SPINE) — up to four quiet follow-up chips
 * under your reply. Each is a short phrase the user can click to send: an answer
 * to your own question, or a next move ("turn this into the plan", "add a phase
 * for glazing"). Essential in grill/wayfinding to carry the thinking forward,
 * but allowed in any mode. Client-resolved (no execute); clicking a chip sends
 * its text as the user's next message.
 */
export const suggestFollowupsTool = {
  description:
    'Offer up to four short follow-up chips under your reply — answers to your own question or sensible next moves the user can click to send. Use them especially while grilling or wayfinding to keep the thinking moving; keep them quiet and few. Client-resolved (no execute).',
  inputSchema: suggestFollowupsSchema,
} as const
