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
import { viewModeSchema, filterOpSchema } from '@/lib/modules/view/schema'

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

/**
 * add_row input schema (#18). The model names an EXISTING collection page by id
 * and proposes ONE new row (a schema-bound child page). Its `props` are keyed by
 * property NAME — the model knows the human names it saw in the schema, never the
 * stable property/option ids — and the accept path resolves each name to its id
 * and coerces the value (unknown names dropped, #18 decision 9). DISTINCT from
 * create_page, which mints an ordinary rail-visible sub-page: add_row mints a row.
 */
const addRowInput = z.object({
  collectionId: z
    .string()
    .min(1)
    .describe(
      'The id of the EXISTING collection page (one that ALREADY has a property schema) to add a row to, taken verbatim from the [Workspace outline] in context. Never invent an id.'
    ),
  title: z
    .string()
    .optional()
    .describe(
      "The new row's title — its page title (e.g. the book name, the task, the person). Strongly preferred; omit only when the row genuinely has no natural name."
    ),
  props: z
    .record(z.string(), z.unknown())
    .describe(
      'The row\'s property values, keyed by property NAME exactly as it appears in the collection\'s schema — e.g. { "Status": "Reading", "Rating": 5, "Finished on": "2026-01-04" }. Names not in the schema are ignored; omit a property to leave it empty. Use the human property NAMES, never ids. For a select/status value, use the option label.'
    ),
  reason: z
    .string()
    .optional()
    .describe('A short, optional note on what this row is (shown on the proposal card).'),
})

/**
 * add_row (#18) — add ONE row to an EXISTING collection (a page that already
 * carries a property schema). Client-resolved (no execute): the tool call renders
 * a proposal card, the user reviews the row + can correct which collection it goes
 * into, and only on accept does the client create a `type='row'` child page with
 * the values coerced against the collection's schema. This is the DISTINCT gesture
 * for a row (#18 decisions 10 & 21) — use create_page for an ordinary sub-page so
 * Pond never has to guess row-vs-subpage.
 */
export const addRowTool = {
  description:
    'Add ONE row (item/entry/record) to an EXISTING collection — a page that ALREADY has a property schema (columns). Use this when the user asks to add an item/entry/row/record to a database, tracker, or collection they already have (e.g. "add Dune to my reading list", "log today\'s workout", "add a task: mill the stock, priority high"). Name the target collection by its id from the [Workspace outline]; give the row a `title` and put its field values in `props` keyed by the schema\'s property NAMES. This is DISTINCT from create_page (which makes an ordinary standalone sub-page, not a schema-bound row) and from define_schema (which defines the columns). Only use add_row when the target already carries a schema; if it does not, use define_schema first. Client-resolved (no execute): the user reviews a proposal card and can correct the target collection before anything is written; do NOT re-ask for confirmation. Use the human property names, never ids. One row per card.',
  inputSchema: addRowInput,
} as const

/**
 * configure_view input schema (#19 slice 5). The model names an EXISTING collection
 * page by id and SELECTS which of the four existing renderers draws its rows, plus
 * an optional single-clause group-by / sort / filter. Every property reference is a
 * NAME (from the [Properties] line in context), never an id — the client resolves
 * name→id (and a select/status filter value label→id) on accept, exactly like
 * add_row. This is a select/configure gesture, NOT a create: nothing new is built.
 *
 * The `.superRefine` forces a board to carry a group-by: a board with no group-by
 * cannot bucket its rows (it degrades to a "needs a group-by" notice), so the model
 * must name one — a failure triggers `repairToolCall`, which re-asks with the fix.
 */
const configureViewInput = z
  .object({
    pageId: z
      .string()
      .min(1)
      .describe(
        'The id of the EXISTING collection page (one that ALREADY has a property schema) whose view to configure, taken verbatim from the [Workspace outline] in context. Never invent an id.'
      ),
    mode: viewModeSchema.describe(
      'Which existing layout draws the collection\'s rows: "table" (grid), "board" (columns grouped by a select/status property), "calendar" (agenda by a date property), "gallery" (cards), or "gantt" (a read-only timeline of bars over Start→End date properties). Pick the one the user asked for.'
    ),
    groupBy: z
      .string()
      .optional()
      .describe(
        'For a BOARD: the NAME of the select or status property to bucket rows under (required for mode="board"), taken from the [Properties] line in context. Use the human property NAME, never an id. Omit for table/gallery; a calendar places rows by its date property automatically.'
      ),
    sort: z
      .object({
        key: z.string().describe('The NAME of the property to sort by (from [Properties]).'),
        dir: z.enum(['asc', 'desc']).describe('Sort direction.'),
      })
      .optional()
      .describe('An optional single-key sort by a property NAME.'),
    filter: z
      .object({
        property: z.string().describe('The NAME of the property to filter on (from [Properties]).'),
        op: filterOpSchema.describe('The comparison: eq, neq, contains, gt, or lt.'),
        value: z
          .string()
          .describe(
            'The value to compare against. For a select/status property use the option LABEL.'
          ),
      })
      .optional()
      .describe('An optional single-clause filter (property NAME op value). One clause only.'),
    startDate: z
      .string()
      .optional()
      .describe(
        "For a GANTT: the NAME of the date property each bar STARTS at (from [Properties]). Optional — omit to auto-use the collection's first date property. Use the human property NAME, never an id."
      ),
    endDate: z
      .string()
      .optional()
      .describe(
        "For a GANTT: the NAME of the date property each bar ENDS at (from [Properties]). Optional — omit to auto-use the collection's second date property; with only one date property, bars are single-day. Use the human property NAME, never an id."
      ),
    reason: z
      .string()
      .optional()
      .describe('A short, optional note on what this view is for (shown on the proposal card).'),
  })
  .superRefine((input, ctx) => {
    if (input.mode === 'board' && !input.groupBy?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A board must group its rows: set `groupBy` to the NAME of a select or status property from the collection (see the [Properties] line in context).',
        path: ['groupBy'],
      })
    }
  })

/**
 * configure_view (#19 slice 5) — SELECT which layout (table/board/calendar/gallery)
 * draws an existing collection's rows, plus an optional group-by/sort/filter. The
 * four renderers already exist; this only picks one and points it at properties by
 * NAME. Client-resolved (no execute): the tool call renders a proposal card, the
 * user reviews the resolved config and can correct the target collection, and only
 * on accept does the client resolve names→ids and upsert THE view block on the page
 * (reconfigure the existing one, or mint one when there is none). DISTINCT from
 * propose_changes (content blocks), define_schema (columns), and add_row (items).
 */
export const configureViewTool = {
  description:
    'Configure how an EXISTING collection\'s items are displayed — SELECT a layout (table, board, calendar, gallery, or gantt) for its rows, optionally grouped, sorted, or filtered. Use this when the user asks to show/display/view/format a collection\'s items a certain way (e.g. "show my tasks as a board grouped by status", "view my reading list as a gallery", "sort this table by due date", "show only the books I\'m still reading", "show this plan as a gantt timeline"). Name the target collection by its id from the [Workspace outline]; name any group-by / sort / filter property by its NAME from the [Properties] line in context (never an id) — for a board you MUST name a select/status property to group by, and for a gantt you may optionally name startDate/endDate date properties (else the first/second date property is used; a gantt needs at least one date property). This does NOT build a new kind of view (the four renderers already exist) and is DISTINCT from propose_changes (edits content blocks), define_schema (defines columns), and add_row (adds an item). Only use it on a page that ALREADY has a property schema; if it does not, use define_schema first. Client-resolved (no execute): the user reviews a proposal card showing the resolved layout and can correct the target before anything is written; do NOT re-ask for confirmation. Use property NAMES, never ids.',
  inputSchema: configureViewInput,
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
