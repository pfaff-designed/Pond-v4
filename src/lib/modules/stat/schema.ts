import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
// format.ts type-imports StatFormat back from here — erased at compile, so the
// value dependency is one-directional (schema → format) and acyclic at runtime.
import { formatStatValue, signedStatDelta } from './format'

/**
 * `stat` (#12) — a headline KPI figure promoted from the Bklit set, wrapping
 * `ChartStatFlow` (NumberFlow-animated). Distinct from `metric` (a compact
 * labelled row, optionally derived LIVE from a bound sibling block) and
 * `metric-ring` (progress toward a target): a `stat` is a standalone,
 * hand-valued big number a page leads with. Read-only, AI-maintained.
 */
export const statFormatSchema = z.enum(['number', 'currency', 'percent'])
export type StatFormat = z.infer<typeof statFormatSchema>

export const statSchema = z.object({
  id: z.string(),
  type: z.literal('stat'),
  /** What the figure is, shown in the kicker voice — e.g. "Monthly revenue". */
  label: z.string(),
  /** The figure itself. For `format: "percent"` this is a FRACTION (0.62 → 62%). */
  value: z.number(),
  /** Display format. Default `number`; `currency` renders USD. */
  format: statFormatSchema.optional(),
  /** Literal text before the formatted value, e.g. "~". */
  prefix: z.string().optional(),
  /** Literal text after the formatted value, e.g. " mi". */
  suffix: z.string().optional(),
  /**
   * Change vs the previous period, as a FRACTION: 0.12 renders "▲ 12%",
   * negative renders "▼". Omit for no trend line.
   */
  delta: z.number().optional(),
  /** Optional one-line caption under the figure (scope, timeframe). */
  caption: z.string().optional(),
})

export type StatBlock = z.infer<typeof statSchema>

export const statDescriptor: ModuleDescriptor<StatBlock> = {
  type: 'stat',
  schema: statSchema,
  description:
    'A headline KPI figure: one big animated number with a label, optional number/currency/percent formatting, prefix/suffix text, an up/down delta, and a caption. Use for THE number a page leads with — revenue, weight, streak length. ' +
    '`delta` is a FRACTION of change vs the previous period (0.12 = up 12%, -0.05 = down 5%); for `format: "percent"` the `value` is also a fraction (0.62 = 62%). ' +
    'Distinct from `metric` (a compact labelled row that can derive its value LIVE from a sibling checklist/table) — prefer `metric` when the number should stay bound to other blocks; use `stat` for a standalone headline figure.',
  serialize: (data) => {
    const delta = data.delta === undefined ? '' : ` (${signedStatDelta(data.delta)})`
    const cap = data.caption ? ` — ${data.caption}` : ''
    return `${data.label}: ${formatStatValue(data)}${delta}${cap}`
  },
}
