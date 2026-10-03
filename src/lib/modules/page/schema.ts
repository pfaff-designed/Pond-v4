import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { blockSchema } from '../content'

/**
 * The `page` container module (t11: "pages are container modules"). Its `blocks`
 * field is the recursive seam locked by t12 — a container's schema references the
 * content union, and its view renders each child by looking it up in the registry.
 * This is the drop-in point for in-page layout later (t18 `section`) with no
 * contract rework.
 */
export const pageModuleSchema = z.object({
  id: z.string(),
  type: z.literal('page'),
  title: z.string().optional(),
  blocks: z.array(blockSchema),
})

export type PageModule = z.infer<typeof pageModuleSchema>

export const pageDescriptor: ModuleDescriptor<PageModule> = {
  type: 'page',
  label: 'page',
  schema: pageModuleSchema,
  // Structural — withheld from the `/` menu (palette.ts), so this line is never shown.
  paletteDescription: 'a page inside this one',
  description:
    'A container that holds an ordered list of content blocks. Everything is a page; a page renders its blocks in order. The AI composes onto a page — it does not mint pages as content.',
  // A page never appears inside a `blocks[]` (the content union excludes it), so
  // only its own title is serialized; child blocks serialize via their own modules.
  serialize: (data) => data.title ?? '',
}
