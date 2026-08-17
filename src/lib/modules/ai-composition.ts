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
import { metricSchema } from './metric/schema'
import { metricRingSchema } from './metric-ring/schema'
import { tableSchema, tableRowSchema } from './table/schema'

/**
 * Per-content-module *data* the AI emits: the persisted block schema with every id
 * stripped (block-level AND nested, e.g. todo item ids). The AI never mints ids;
 * the client mints them on accept (branch 2). `type` stays as the discriminant so
 * the model still sees each type's exact shape. Zod objects strip unknown keys by
 * default, so an id the model volunteers anyway is dropped, not honoured.
 *
 * The `page` container module is intentionally excluded — composition stays a flat
 * ordered content list until `section` lands (t18, branch 3).
 */
const textData = textSchema.omit({ id: true })
const todoData = todoSchema
  .omit({ id: true })
  .extend({ items: z.array(todoItemSchema.omit({ id: true })) })
const metricData = metricSchema.omit({ id: true })
const metricRingData = metricRingSchema.omit({ id: true })
const tableData = tableSchema
  .omit({ id: true })
  .extend({ rows: z.array(tableRowSchema.omit({ id: true })) })

export const moduleDataSchema = z.discriminatedUnion('type', [
  textData,
  todoData,
  metricData,
  metricRingData,
  tableData,
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

export const changeSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create'),
    data: moduleDataSchema,
    after: z
      .string()
      .optional()
      .describe('Existing blockId to insert after; omit to append to the end'),
    reason,
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
  }),
  z.object({
    op: z.literal('remove'),
    blockId: z.string().describe('Existing block id, from the injected context'),
    reason,
  }),
])
export type ModuleChange = z.infer<typeof changeSchema>

/** The `propose_changes` tool input: a non-empty batch of composition operations. */
export const proposeChangesSchema = z.object({
  changes: z.array(changeSchema).min(1),
})
export type ProposeChanges = z.infer<typeof proposeChangesSchema>

/**
 * NL capability list for the system prompt — one line per composable content
 * module. Derived from the registry so a new module auto-appears here. Excludes the
 * `page` container (see above): the AI composes flat content until t18.
 */
export const moduleCatalog = Object.values(moduleDescriptors)
  .filter((d) => d.type !== 'page')
  .map((d) => `- ${d.type}: ${d.description}`)
  .join('\n')
