import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
// Type-only: erased at compile, so no runtime cycle with content.ts (which
// imports this schema). derive.ts itself imports only types — safe at runtime.
import type { Block } from '../content'
import { deriveMetricValue } from './derive'

/** What a metric counts from its bound source block. */
export const metricSourceKindSchema = z.enum(['checklist-checked', 'checklist-total', 'table-rows'])
export type MetricSourceKind = z.infer<typeof metricSourceKindSchema>

/**
 * Optional live binding (ticket-23) — the PERSISTED form. Points a metric at a
 * sibling block in the same page so its displayed value is DERIVED from that block's
 * current state instead of being manually maintained. The AI declares the binding
 * (which block, which count); it never computes the number — derivation lives in
 * `derive.ts`.
 *
 * `blockId` only, deliberately. The EMIT-time schema (ai-composition.ts) additionally
 * accepts `metricSourceRefSchema` below — a batch-local `ref` for same-batch bindings
 * (ticket-31) — but that form is resolved to a real `blockId` at accept time and must
 * NEVER reach storage. Keeping the persisted schema blockId-only makes that invariant
 * structural: a forgotten resolve pass FAILS `blockSchema` validation in
 * `hydrateBlock` (the change is skipped) instead of silently persisting a `ref`.
 */
export const metricSourceSchema = z.object({
  /** The sibling block whose state feeds this metric (an existing block's id). */
  blockId: z.string(),
  kind: metricSourceKindSchema,
})

export type MetricSource = z.infer<typeof metricSourceSchema>

/**
 * The EMIT-only same-batch binding form (ticket-31). `ref` names a `bindKey` the AI
 * put on a sibling create in the SAME batch — a propose_changes create op, or a
 * create_page block entry. The client resolves `ref` → the freshly-minted `blockId`
 * at accept time (`same-batch-refs.ts`); an unknown `ref` (its create was rejected or
 * failed validation) drops the whole `source` so the metric lands manual, never
 * dangling. Composed into the emit union in ai-composition.ts; NOT part of the
 * persisted `metricSchema` (see above).
 */
export const metricSourceRefSchema = z.object({
  /** A `bindKey` from a sibling create in the same batch. Resolved to a real
   *  `blockId` on accept; never persisted in this form. */
  ref: z.string(),
  kind: metricSourceKindSchema,
})

export type MetricSourceRef = z.infer<typeof metricSourceRefSchema>

/**
 * A single labelled number with an optional unit and trend. Read-only display.
 * When `source` is set the value is derived live from a sibling block; otherwise the
 * manual `value` shows (and if a bound source goes missing, it falls back to it).
 */
export const metricSchema = z.object({
  id: z.string(),
  type: z.literal('metric'),
  label: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
  source: metricSourceSchema.optional(),
})

export type MetricBlock = z.infer<typeof metricSchema>

export const metricDescriptor: ModuleDescriptor<MetricBlock> = {
  type: 'metric',
  schema: metricSchema,
  description:
    'A single labelled figure (with optional unit and up/down/flat trend). Use to surface one key number — a total, a balance, a count. ' +
    'A metric can be LIVE: set `source` to derive its value from a sibling block instead of a manual number — ' +
    "`checklist-checked` counts ticked items in a checklist, `checklist-total` counts all its items, `table-rows` counts a table's rows. " +
    'Prefer a bound metric over a hand-entered count when the same fact already lives in a checklist or table on the page, so the number stays live. ' +
    'Two ways to name the source: (1) `source: { blockId, kind }` binds to an EXISTING block from the injected context; ' +
    '(2) `source: { ref, kind }` binds to a sibling block created in the SAME batch — put `bindKey: "chores"` on that sibling (on the create operation in propose_changes, or directly on the block entry in create_page blocks), then reference it here as `source: { ref: "chores", kind: "checklist-checked" }`. ' +
    'You can and SHOULD create a checklist (or table) and its bound metric together in one turn this way — in propose_changes AND in create_page. Never invent a blockId for a block you are creating; use bindKey/ref for those.',
  // A bound metric must serialize the SAME number the UI derives — the AI's page
  // context and the embeddings must never disagree with what the user sees. With
  // `siblings` in hand we derive exactly as the view does (stale → manual value,
  // flagged); without them we state the binding + fallback instead of guessing.
  serialize: (data, siblings) => {
    const unit = data.unit ? ` ${data.unit}` : ''
    if (!data.source) return `${data.label}: ${data.value}${unit}`
    if (siblings === undefined) {
      return `${data.label}: derived live from block ${data.source.blockId} (manual fallback: ${data.value}${unit})`
    }
    const derived = deriveMetricValue(data, siblings as readonly Block[])
    return derived.state === 'derived'
      ? `${data.label}: ${derived.value}${unit} (live, derived from block ${derived.sourceId})`
      : `${data.label}: ${data.value}${unit} (bound source ${data.source.blockId} missing; manual value shown)`
  },
}
