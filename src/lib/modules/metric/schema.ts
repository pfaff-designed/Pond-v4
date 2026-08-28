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
 * Optional live binding (ticket-23, extended by ticket-31). Points a metric at a
 * sibling block in the same page so its displayed value is DERIVED from that block's
 * current state instead of being manually maintained. The AI declares the binding
 * (which block, which count); it never computes the number — derivation lives in
 * `derive.ts`.
 *
 * Two ways to name the source block:
 *
 * - `blockId` — an EXISTING sibling block (from the injected context). This is what
 *   a persisted, resolved binding always carries.
 * - `ref` — a batch-local KEY (ticket-31 same-batch bindings). When the AI creates a
 *   checklist/table AND a metric that counts it in ONE `changes[]` batch, the source
 *   block has no id yet (the client mints ids on accept — t16 branch 2). The create
 *   op tags itself with a `key`, and the metric references that `key` via `ref`. On
 *   accept the client resolves `ref` → the freshly-minted `blockId` in a single pass,
 *   so what actually PERSISTS is always the `blockId` form — an unresolved `ref`
 *   never survives into storage. An unknown `ref` (its create op was rejected) drops
 *   the whole `source`, so the metric falls back to its manual value and never
 *   dangles.
 *
 * Exactly one of `blockId` / `ref` is present. Modelled as a union so the emit-time
 * schema forbids both-or-neither.
 */
export const metricSourceSchema = z.union([
  z.object({
    /** The sibling block whose state feeds this metric (an existing block's id). */
    blockId: z.string(),
    kind: metricSourceKindSchema,
  }),
  z.object({
    /** A batch-local key naming a block created in the SAME changes[] batch. Resolved
     *  to a real `blockId` at accept time; never persisted in this form. */
    ref: z.string(),
    kind: metricSourceKindSchema,
  }),
])

export type MetricSource = z.infer<typeof metricSourceSchema>

/**
 * The RESOLVED source id, or `undefined` for a source still naming a batch-local
 * `ref` (which only exists transiently before accept-time resolution). Everything
 * that reads a live value — derive.ts, the view, serialize — goes through here, so a
 * pre-resolution `ref` degrades to "unbound" rather than crashing on a missing
 * `blockId`. A persisted metric always carries the `blockId` form, so in practice
 * this returns the id.
 */
export function sourceBlockId(source: MetricSource | undefined): string | undefined {
  if (!source) return undefined
  return 'blockId' in source ? source.blockId : undefined
}

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
    '(2) `source: { ref, kind }` binds to a block you create in the SAME batch — give that create op a `key`, then reference it here with the same string as `ref`. ' +
    'This means you can and SHOULD create a checklist (or table) and its bound metric together in one turn: put `key: "chores"` on the checklist create, and `source: { ref: "chores", kind: "checklist-checked" }` on the metric. Never invent a blockId for a block you are creating.',
  // A bound metric must serialize the SAME number the UI derives — the AI's page
  // context and the embeddings must never disagree with what the user sees. With
  // `siblings` in hand we derive exactly as the view does (stale → manual value,
  // flagged); without them we state the binding + fallback instead of guessing.
  serialize: (data, siblings) => {
    const unit = data.unit ? ` ${data.unit}` : ''
    const boundId = sourceBlockId(data.source)
    // No source, or a source still naming an unresolved batch-local `ref` (which
    // only exists transiently before accept — a persisted metric never serializes
    // one): treat as the plain manual figure.
    if (!data.source || boundId === undefined) return `${data.label}: ${data.value}${unit}`
    if (siblings === undefined) {
      return `${data.label}: derived live from block ${boundId} (manual fallback: ${data.value}${unit})`
    }
    const derived = deriveMetricValue(data, siblings as readonly Block[])
    return derived.state === 'derived'
      ? `${data.label}: ${derived.value}${unit} (live, derived from block ${derived.sourceId})`
      : `${data.label}: ${data.value}${unit} (bound source ${boundId} missing; manual value shown)`
  },
}
