import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * Optional live binding (ticket-23). Points a metric at a sibling block in the same
 * page so its displayed value is DERIVED from that block's current state instead of
 * being manually maintained. The AI declares the binding (which block, which count);
 * it never computes the number — derivation lives in `derive.ts`.
 *
 * `blockId` must reference an EXISTING sibling block. The AI cannot bind to a block
 * it creates in the same `changes[]` batch: those ids are client-minted only on
 * accept, so they don't exist yet when the model emits (t16 branch 2). See the
 * descriptor description and ticket-23's Resolution for that boundary.
 */
export const metricSourceSchema = z.object({
  /** The sibling block whose state feeds this metric (an existing block's id). */
  blockId: z.string(),
  /** What to count from the source block. */
  kind: z.enum(['checklist-checked', 'checklist-total', 'table-rows']),
})

export type MetricSource = z.infer<typeof metricSourceSchema>

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
    'A metric can be LIVE: set `source: { blockId, kind }` to derive its value from an EXISTING sibling block instead of a manual number — ' +
    "`checklist-checked` counts ticked items in a checklist, `checklist-total` counts all its items, `table-rows` counts a table's rows. " +
    'Prefer a bound metric over a hand-entered count when the same fact already lives in a checklist or table on the page, so the number stays live. ' +
    'You can only bind to a block that ALREADY exists (from the injected context) — not one you create in the same batch, whose id is minted later. ' +
    'To bind a metric to a checklist/table you are also creating: create that block first, then in a follow-up turn (once it exists) add the bound metric.',
  serialize: (data) => `${data.label}: ${data.value}${data.unit ? ` ${data.unit}` : ''}`,
}
