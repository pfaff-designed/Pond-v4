import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/** A prose block, markdown source. Simplest content module. */
export const textSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  content: z.string(), // markdown
})

export type TextBlock = z.infer<typeof textSchema>

export const textDescriptor: ModuleDescriptor<TextBlock> = {
  type: 'text',
  schema: textSchema,
  description:
    'A prose block written in markdown. Use for notes, explanations, headings, and any freeform writing.',
  serialize: (data) => data.content,
}
