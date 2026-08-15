import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/** A single labelled number with an optional unit and trend. Read-only display. */
export const metricSchema = z.object({
  id: z.string(),
  type: z.literal('metric'),
  label: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
})

export type MetricBlock = z.infer<typeof metricSchema>

export const metricDescriptor: ModuleDescriptor<MetricBlock> = {
  type: 'metric',
  schema: metricSchema,
  description:
    'A single labelled figure (with optional unit and up/down/flat trend). Use to surface one key number — a total, a balance, a count.',
}
