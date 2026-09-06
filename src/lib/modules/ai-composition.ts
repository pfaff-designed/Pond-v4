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
import { moduleDescriptors, RETIRED_FROM_CREATION } from './registry'
import { textSchema } from './text/schema'
import { todoSchema, todoItemSchema } from './todo/schema'
import {
  metricSchema,
  metricSourceSamePageSchema,
  metricSourceCrossPageSchema,
  metricSourceAggregateSchema,
  metricSourceRefSchema,
} from './metric/schema'
import { metricRingSchema } from './metric-ring/schema'
import { tableSchema, tableRowSchema } from './table/schema'
import { chartLineSchema } from './chart-line/schema'
import { chartBarSchema } from './chart-bar/schema'
import { chartAreaSchema } from './chart-area/schema'
import { heatmapSchema } from './heatmap/schema'
import { statSchema } from './stat/schema'
import { viewSchema } from './view/schema'
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
 * Metric EMIT data (ticket-31, ticket-38): the persisted schema accepts the three
 * STABLE source forms (same-page block, cross-page block, child-pages aggregate). At
 * emit time the model may ALSO bind by `{ ref }` to a `bindKey` on a sibling create in
 * the same batch (ticket-31). The accept path resolves ref→minted blockId before
 * hydration; the persisted schema then rejects any `ref` that slipped through
 * unresolved (structural invariant, not convention). The union is spelled out flat
 * (per-form, not nested unions) so the derived JSON tool schema is a clean `oneOf`.
 *
 * Branch ORDER matters (zod strips unknown keys, so a permissive branch swallows a
 * richer one): cross-page (`pageId`+`blockId`) and aggregate (`pages`) come BEFORE the
 * bare same-page `{ blockId }`, else `{ pageId, blockId }` would collapse to same-page.
 * `ref` stays LAST so a stray `{ blockId, ref }` still resolves to the safe blockId form
 * (the existing ticket-31 both-keys test) — and is STRICT (review fix): a lax ref branch
 * would catch a malformed `{ pageId, ref, kind }` (no blockId, so every stable branch
 * fails) and silently strip the `pageId`, turning cross-page intent into a same-batch
 * ref. Strict makes that shape fail the whole union → the tool-input gate rejects it and
 * `repairToolCall` re-asks the model, instead of persisting the wrong binding.
 */
const metricData = metricSchema.omit({ id: true }).extend({
  source: z
    .union([
      metricSourceCrossPageSchema,
      metricSourceAggregateSchema,
      metricSourceSamePageSchema,
      metricSourceRefSchema.strict(),
    ])
    .optional(),
})
const metricRingData = metricRingSchema.omit({ id: true })
const tableData = tableSchema
  .omit({ id: true })
  .extend({ rows: z.array(tableRowSchema.omit({ id: true })) })
// ticket-36: Bklit chart promotion. Charts carry no nested id-bearing collections
// (their `points` are plain `{ x, values }`), so a flat top-level id strip is the
// whole omit-chain — the module-nested-ids fence pins that.
const chartLineData = chartLineSchema.omit({ id: true })
const chartBarData = chartBarSchema.omit({ id: true })
const chartAreaData = chartAreaSchema.omit({ id: true })
// #12: Bklit promotion, wave 2. Like the charts, neither block carries a nested
// id-bearing collection (heatmap `cells` are plain `{ date, value }`), so a flat
// top-level id strip is the whole omit-chain — the module-nested-ids fence pins it.
const heatmapData = heatmapSchema.omit({ id: true })
const statData = statSchema.omit({ id: true })
// #19: a view is config only — no nested id-bearing collections (its rows are
// child pages, its groupBy/sort/filter reference existing property ids). So the
// emit shape is a flat top-level id strip, like a chart.
const viewData = viewSchema.omit({ id: true })

export const moduleDataSchema = z.discriminatedUnion('type', [
  textData,
  todoData,
  metricData,
  metricRingData,
  tableData,
  chartLineData,
  chartBarData,
  chartAreaData,
  heatmapData,
  statData,
  viewData,
])
export type ModuleData = z.infer<typeof moduleDataSchema>

/**
 * One composition operation. `op` is composition-level (which blocks exist) — NOT a
 * within-module ops grammar (t12 kept that closed). The AI references existing
 * blocks by `blockId` (from the injected context) and never invents one; `after`
 * anchors placement, and `changes[]` array order sequences the batch (branch 3).
 * `edit` may type-morph (swap `type` + `data` on the same id, preserving identity
 * and position). Every variant may carry an optional `reason` — a short note the
 * diff card shows the user on what this change does and why.
 */
const reason = z
  .string()
  .optional()
  .describe('A short, optional note on what this change does and why (shown to the user)')

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
  metricData.extend({ bindKey }),
  metricRingData.extend({ bindKey }),
  tableData.extend({ bindKey }),
  // ticket-36: Bklit chart promotion. No block in a batch binds to a chart, but the
  // union must list every content type so a page can be created WITH a chart.
  chartLineData.extend({ bindKey }),
  chartBarData.extend({ bindKey }),
  chartAreaData.extend({ bindKey }),
  // #12: heatmap/stat promotions — nothing binds to them, but a page must be
  // creatable WITH them, so the union lists every content type (parity fence).
  heatmapData.extend({ bindKey }),
  statData.extend({ bindKey }),
  // #19: a page can be created WITH a view block. No block binds to a view, but
  // the union lists every content type for parity with the persisted union.
  viewData.extend({ bindKey }),
])
export type CreatePageBlock = z.infer<typeof createPageBlockSchema>

export const changeSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create'),
    data: moduleDataSchema,
    after: z
      .string()
      .optional()
      .describe('Existing blockId to insert after; omit to append to the end'),
    bindKey,
    reason,
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
    reason,
    inferred,
  }),
  z.object({
    op: z.literal('remove'),
    blockId: z.string().describe('Existing block id, from the injected context'),
    reason,
    inferred,
  }),
])
export type ModuleChange = z.infer<typeof changeSchema>

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
const RETIRED = new Set<string>(RETIRED_FROM_CREATION)
export const moduleCatalog = Object.values(moduleDescriptors)
  .filter((d) => d.type !== 'page' && !RETIRED.has(d.type))
  .map((d) => `- ${d.type}: ${d.description}`)
  .join('\n')
