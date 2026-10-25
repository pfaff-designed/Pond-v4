/**
 * AI composition contract (t16) — server-safe.
 *
 * Builds, from the t12 registry, the two artifacts the AI needs to *compose*
 * modules:
 *   (a) `proposeChangesSchema` — the discriminated-union tool input the model must
 *       fill. It structurally cannot emit an unknown module `type` (the `data`
 *       union is closed over the registry) or an id it minted (every id is
 *       stripped — the client mints on accept, branch 2).
 *   (b) `moduleCatalog` — the natural-language capability list assembled from each
 *       descriptor's `description`, injected into the system prompt.
 *
 * The `moduleCatalog` is fully registry-derived — a new module auto-appears in the
 * prompt with zero edits here (branch 4). The `data` union is NOT auto-derived:
 * adding a module means adding its id-stripped schema to `moduleDataSchema` below
 * (discriminated-union construction from a registry isn't ergonomic in Zod — kept
 * explicit on purpose). Pure Zod + strings, no React: importable in the chat Route
 * Handler with no client bundle poison.
 */
import { z } from 'zod'
import { moduleDescriptors } from './registry'
import { textSchema } from './text/schema'
import { todoSchema, todoItemSchema } from './todo/schema'
import { tableSchema, tableRowSchema } from './table/schema'
import { viewSchema, viewSavedViewSchema } from './view/schema'
import { imageSchema } from './image/schema'
import { highlightSchema } from './highlight/schema'
import { entriesSchema, entrySchema } from './entries/schema'
import { pageLinkSchema } from './page-link/schema'
import { tocSchema } from './toc/schema'
import { isMarkdownPipeTable, PIPE_TABLE_IN_TEXT_MESSAGE } from './authoring-lint'

/**
 * Per-content-module *data* the AI emits: the persisted block schema with every id
 * stripped (block-level AND nested, e.g. todo item ids). The AI never mints ids;
 * the client mints them on accept (branch 2). `type` stays as the discriminant so
 * the model still sees each type's exact shape. Zod objects strip unknown keys by
 * default, so an id the model volunteers anyway is dropped, not honoured.
 *
 * The `page` container module is intentionally excluded — composition stays a flat
 * ordered content list until `section` lands (t18, branch 3).
 *
 * Each omit-chain must strip the ids at the descriptor's `nestedIdPaths` — jest
 * fence in `module-nested-ids.test.ts` (strip∘hydrate round-trip per type).
 *
 * The optional block `label` (#258, `labelledBlockFields` on text / highlight /
 * todo / view / entries) rides through every omit-chain untouched — it is the
 * block's own eyebrow, not an id — so Pond can emit a labelled block (ADR 0006: a
 * block Pond cannot label is a template Pond cannot write). `block-label.test.ts`
 * pins it on both unions. The text block's optional `placeholder` rides through the
 * same way — Pond can emit a block's placeholder copy, never its content.
 */
/**
 * Text data with the ticket-21 emit-time lint attached: reject a body that is
 * clearly a markdown pipe table. Failing this refinement fails the tool-input gate,
 * which triggers `repairToolCall` — re-asking the model to re-emit as a `table`
 * module (the corrective message names the fix). Prose that merely contains a `|`
 * is not flagged (the heuristic requires a full GFM table shape). This is an
 * authoring-discipline nudge, NOT a persistence constraint: the persisted
 * `textSchema` stays unchanged, so nothing already saved becomes invalid.
 */
const textBase = textSchema.omit({ id: true })
const noPipeTable = (d: { content: string }) => !isMarkdownPipeTable(d.content)
const pipeTableIssue = { message: PIPE_TABLE_IN_TEXT_MESSAGE, path: ['content'] }
const textData = textBase.refine(noPipeTable, pipeTableIssue)
const todoData = todoSchema
  .omit({ id: true })
  .extend({ items: z.array(todoItemSchema.omit({ id: true })) })
/**
 * #111 is finished. The nine data-HOLDING display blocks (metric, metric-ring, stat,
 * the three charts, heatmap, timeline, kanban) are DELETED, not merely absent from the
 * emit unions. Each carried its own copy of the data, which the design forbids — "the
 * record is the source of truth… nothing holds a copy" — so a chart, a board and a
 * headline figure are MODES of the `view` block, aggregated from the records at read
 * time. Production held zero blocks of those types across all 85 pages, so there was
 * nothing to migrate and no read-tolerance left to keep.
 *
 * The same-batch `bindKey`/`ref` plumbing stays in place (the accept path and the
 * create surfaces still carry it) for whatever binds next; nothing emits a ref today.
 */
const tableData = tableSchema
  .omit({ id: true })
  .extend({ rows: z.array(tableRowSchema.omit({ id: true })) })
// #19: a view's config references existing property/page ids (groupBy/sort/
// filter/collectionId), nothing minted. Its rows are child pages, not part of
// this shape either. The one nested id-bearing collection is `views` (KAN-32):
// each saved view mints its own id at hydration, so the omit-chain strips it
// the same way todo's items and table's rows do.
const viewData = viewSchema
  .omit({ id: true })
  .extend({ views: z.array(viewSavedViewSchema.omit({ id: true })).optional() })
// #61: an image/file block references an already-uploaded attachment by URL —
// no nested id-bearing collections, so a flat top-level id strip is the whole
// omit-chain (the module-nested-ids fence pins it). The catalog description
// tells the model to only use URLs it has actually seen, never invented ones.
const imageData = imageSchema.omit({ id: true })
// #249: a highlight is one kept passage — authored text with no nested id-bearing
// collections, so a flat top-level id strip is the whole omit-chain. ADR 0006 names
// this entry a work item: a block absent from this union is a block Pond cannot use.
const highlightData = highlightSchema.omit({ id: true })
// #250: a dated log's rows carry their own ids (`nestedIdPaths: ['entries']`), so
// the omit-chain strips at both levels, as todo's. The optional `serif` flag rides
// through untouched — a journal Pond composes stays a journal.
const entriesData = entriesSchema
  .omit({ id: true })
  .extend({ entries: z.array(entrySchema.omit({ id: true })) })
// KAN-122: `pageId` references an existing page (like a view's `collectionId`) —
// nothing minted, so a flat top-level id strip is the whole omit-chain.
const pageLinkData = pageLinkSchema.omit({ id: true })
// KAN-482: a table of contents carries no fields of its own — a flat top-level id
// strip is the whole omit-chain, like page-link's.
const tocData = tocSchema.omit({ id: true })

export const moduleDataSchema = z.discriminatedUnion('type', [
  textData,
  todoData,
  tableData,
  viewData,
  imageData,
  highlightData,
  entriesData,
  pageLinkData,
  tocData,
])
export type ModuleData = z.infer<typeof moduleDataSchema>

/**
 * The registered modules that are deliberately NOT in `moduleDataSchema`, each with
 * the reason (#261, folding in ADR 0007's "228f" parity pass as a guard). The
 * registry's keys must equal the emit union's types PLUS these — a ninth module is a
 * test failure (`template-emit-parity.test.ts`) unless it is either emitted or
 * declared here with a reason. One documented map, not a hand-kept skip list in a
 * test: the exclusion lives beside the union it excludes from, and `moduleCatalog`
 * below reads the same map, so the prompt and the tool schema cannot disagree.
 */
export const NON_EMITTABLE_MODULES = {
  page: 'the container module — composition stays a flat ordered content list until `section` lands (t18, branch 3)',
} as const satisfies Partial<Record<keyof typeof moduleDescriptors, string>>
export type NonEmittableType = keyof typeof NON_EMITTABLE_MODULES

/**
 * Inferred-vs-requested split (ticket-30). A change the user explicitly asked for
 * omits this flag; a change YOU inferred as a helpful side-effect (e.g. ticking
 * "first class booked" when they only asked to add a flight) sets `inferred: true`
 * so the card can label it distinctly and the user decides it separately. Purely an
 * authoring annotation — it never reaches storage (the accept path reads only op /
 * data / blockId / after / bindKey).
 */
const inferred = z
  .boolean()
  .optional()
  .describe(
    'Set true ONLY for a change you inferred as a side-effect the user did not explicitly ask for, so it is presented as a separate decision. Omit for changes the user directly requested.'
  )

/**
 * A batch-local binding key (ticket-31 same-batch bindings). Carried by a `create`
 * op (propose_changes) or a block entry (create_page blocks); a metric in the same
 * batch binds to it via `source: { ref: <bindKey>, kind }`. The client resolves
 * ref→minted-id at accept time.
 */
const bindKey = z
  .string()
  .optional()
  .describe(
    'A batch-local key naming THIS new block so a metric in the SAME batch can bind to it before its id exists ' +
      '(the metric sets `source: { ref: <this bindKey>, kind }`). The client resolves ref→minted-id on accept. ' +
      'Only needed when another block in this batch references this one; omit otherwise.'
  )

/**
 * A create_page block entry: module data plus the optional `bindKey` (ticket-31).
 * The wrapper lives at the entry level (like the create op above) so the PERSISTED
 * block schemas stay free of authoring-only fields; `hydrateProposalBlocks` strips
 * it after resolving refs (schema validation drops the unknown key). Built as its
 * own discriminated union with `bindKey` extended onto every member — not an
 * intersection — so the derived JSON tool schema is a clean `oneOf` whose branches
 * each allow `bindKey` (an intersection's `allOf` would clash with the branches'
 * `additionalProperties: false` and steer the model away from ever emitting it).
 * The text branch re-applies the ticket-21 pipe-table lint so both unions gate it.
 */
export const createPageBlockSchema = z.discriminatedUnion('type', [
  textBase.extend({ bindKey }).refine(noPipeTable, pipeTableIssue),
  todoData.extend({ bindKey }),
  tableData.extend({ bindKey }),
  // #19: a page can be created WITH a view block. No block binds to a view, but
  // the union lists every content type for parity with the persisted union.
  viewData.extend({ bindKey }),
  // #61: a page can be created WITH an image/file block (an attachment the
  // user already uploaded). Nothing binds to it — parity with the persisted union.
  imageData.extend({ bindKey }),
  // #249: a page can be created WITH a kept passage (a reading list's `kept` line).
  // Nothing binds to it — parity with the persisted union.
  highlightData.extend({ bindKey }),
  // #250: a page can be created WITH a dated log (a project's `updates`, a journal's
  // `entries`). Nothing binds to it — parity with the persisted union.
  entriesData.extend({ bindKey }),
  // KAN-122: a page can be created WITH a page link. Nothing binds to it —
  // parity with the persisted union.
  pageLinkData.extend({ bindKey }),
  // KAN-482: a page can be created WITH a table of contents. Nothing binds to it —
  // parity with the persisted union.
  tocData.extend({ bindKey }),
])
export type CreatePageBlock = z.infer<typeof createPageBlockSchema>

/**
 * One composition operation. `op` is composition-level (which blocks exist) — NOT a
 * within-module ops grammar (t12 kept that closed). The AI references existing
 * blocks by `blockId` (from the injected context) and never invents one; `after`
 * anchors placement, and `changes[]` array order sequences the batch (branch 3).
 * `edit` may type-morph (swap `type` + `data` on the same id, preserving identity
 * and position).
 */
export const changeSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create'),
    data: moduleDataSchema,
    after: z
      .string()
      .optional()
      .describe('Existing blockId to insert after; omit to append to the end'),
    bindKey,
    inferred,
  }),
  z.object({
    op: z.literal('edit'),
    blockId: z.string().describe('Existing block id, from the injected context'),
    data: moduleDataSchema,
    after: z
      .string()
      .optional()
      .describe('Move the block to just after this blockId; omit to keep its position'),
    inferred,
  }),
  z.object({
    op: z.literal('remove'),
    blockId: z.string().describe('Existing block id, from the injected context'),
    inferred,
  }),
])
export type ModuleChange = z.infer<typeof changeSchema>

/** Required on every proposal tool (propose_changes and the five collection
 *  tools in `chat/tools.ts`) — KAN-334's one-sentence answer rendered above
 *  the card, never pasted per-schema. */
export const assumptionField = z
  .string()
  .min(1)
  .describe(
    'Write this BEFORE the changes. One sentence that begins "Assuming" or "Taking" and names the reading you chose where the instruction left room: which date or value a relative amount is measured from, which block you read as the target, what you take as given. Example: "Taking \'next month\' from the 14 Mar due date already on the page." Never describe what changes ("The due date moves to 14 Apr.") — the card already shows that. Write no other prose in this turn.'
  )

/**
 * The `propose_changes` tool input: a non-empty batch of composition operations,
 * optionally aimed at a page OTHER than the one currently open (ticket-30).
 *
 * `targetPageId` names the page this batch edits, taken by ID from the injected
 * workspace outline (never fuzzy title). Omit it to edit the currently-open page.
 * When set, the model MUST have called `read_page` on that id first so its block
 * ids in `edit`/`remove`/`after` reference the TARGET page's real blocks. The
 * client resolves the id against the user's pages and stamps the proposal target;
 * an id absent from the workspace is ignored (falls back to the open page).
 */
export const proposeChangesSchema = z.object({
  assumption: assumptionField,
  targetPageId: z
    .string()
    .optional()
    .describe(
      'The id of the page to edit when it is NOT the page currently open — copy it verbatim from the [Workspace outline] in context. Call read_page on this id first so your block references are correct. Omit to edit the current page.'
    ),
  changes: z.array(changeSchema).min(1),
})
export type ProposeChanges = z.infer<typeof proposeChangesSchema>

/**
 * NL capability list for the system prompt — one line per composable content
 * module. Derived from the registry so a new module auto-appears here. Excludes the
 * `page` container (see above): the AI composes flat content until t18.
 */
export const moduleCatalog = Object.values(moduleDescriptors)
  .filter((d) => !(d.type in NON_EMITTABLE_MODULES))
  .map((d) => `- ${d.type}: ${d.description}`)
  .join('\n')
