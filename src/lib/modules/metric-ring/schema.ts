import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * A progress ring around a focal numeral — harvested from the v85 proto `Ring`.
 * The first module that isn't a persisted-since-day-one block: it proves the
 * registry is extensible with zero edits to any consumer (the `default:` cases in
 * context assembly already tolerate unknown types).
 */
export const metricRingSchema = z.object({
  id: z.string(),
  type: z.literal('metric-ring'),
  /** The focal numeral shown inside the ring, e.g. "38". */
  label: z.string(),
  /** Small caption under the numeral, e.g. "MILES". */
  sub: z.string().optional(),
  /**
   * Ring fill fraction, 0..1. NOTE (deferred to t16): this is presentation-shaped
   * — the harvested proto stored a rendered fraction, not a domain `value` + `target`
   * the view derives. Left flat per t12 §5 ("ship flat, refactor when a real case
   * hurts"); t16 (where the AI composes a ring) is where value/target gets ratified.
   */
  pct: z.number().min(0).max(1),
})

export type MetricRingBlock = z.infer<typeof metricRingSchema>

export const metricRingDescriptor: ModuleDescriptor<MetricRingBlock> = {
  type: 'metric-ring',
  schema: metricRingSchema,
  description:
    'A progress ring around a focal number. Use for a single metric that has a target or completion percentage — miles run toward a goal, budget used, a streak.',
}
