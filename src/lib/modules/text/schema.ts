import { z } from 'zod'
import { labelledBlockFields, type ModuleDescriptor } from '../types'

/**
 * A prose block, markdown source. Simplest content module.
 *
 * `label` (#258) is the board's fork: `PondTemplate.dc.html` — `bare = k === 'text'
 * && !label`. With no label the block is BARE prose at `padding 2px 4px` (the
 * `page` and `notes` templates); with one it is an ordinary card whose eyebrow is
 * the label (`project → goal`, `meeting → notes`). The field is the shared mixin,
 * declared once in `types.ts`.
 */
export const textSchema = z
  .object({
    id: z.string(),
    type: z.literal('text'),
    content: z.string(), // markdown
  })
  .extend(labelledBlockFields)

export type TextBlock = z.infer<typeof textSchema>

export const textDescriptor: ModuleDescriptor<TextBlock> = {
  type: 'text',
  schema: textSchema,
  description:
    'A prose block written in markdown. Use for notes, explanations, headings, and any freeform writing.',
  serialize: (data) => data.content,
}
