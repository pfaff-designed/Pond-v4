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
    placeholder: z
      .string()
      .optional()
      .describe(
        'Optional invitation shown at ink .68 while the block has no content — e.g. "write your notes here". Omit to use the generic empty-state copy.'
      ), // drawn at ink .68 while empty; never written to `content`
    pondStampAt: z
      .string()
      .optional()
      .describe(
        'ISO timestamp, present only on the prose block a made page is born with (6a frame 5). Set once at make-page time; nothing else ever sets or clears it.'
      ),
    /**
     * KAN-515: whether this block is a toggle heading — a heading with a chevron
     * that folds the blocks under it. Absent means an ordinary heading, so a page
     * that predates this ticket reads unchanged.
     */
    toggle: z.boolean().optional(),
    /** Whether a toggle heading's following blocks are hidden. Absent = unfolded. */
    folded: z.boolean().optional(),
  })
  .extend(labelledBlockFields)

export type TextBlock = z.infer<typeof textSchema>

export const textDescriptor: ModuleDescriptor<TextBlock> = {
  type: 'text',
  label: 'text',
  schema: textSchema,
  description:
    'A prose block written in markdown. Use for notes, explanations, headings, and any freeform writing.',
  serialize: (data) => data.content,
}
