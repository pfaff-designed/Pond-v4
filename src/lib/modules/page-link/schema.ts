import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * `page-link` (KAN-122) — the block `/ nested page` leaves at the `/` line's own
 * index instead of deleting it (6k frame 2: "a page link stays behind"). Carries
 * only the pointer; the linked page's live title, block count and `new` state are
 * all read off the already-loaded pages-rows cache through this folder's
 * `context.tsx`/`resolve.ts` (shared with F27's card→page links) — "the record is
 * the source of truth," never a second copy on the block.
 */
export const pageLinkSchema = z.object({
  id: z.string(),
  type: z.literal('page-link'),
  pageId: z.string(),
})
export type PageLinkBlock = z.infer<typeof pageLinkSchema>

/**
 * A page-link block with the linked page's live title grafted on by the
 * `assemble.ts` hydration seam — transient, never persisted. Same shape as
 * `HydratedViewBlock` (`view/schema.ts`).
 */
export type HydratedPageLinkBlock = PageLinkBlock & { title?: string }

export const pageLinkDescriptor: ModuleDescriptor<PageLinkBlock> = {
  type: 'page-link',
  label: 'page link',
  schema: pageLinkSchema,
  description:
    'A link to another page, rendered as one row (page icon, title, block count) with no card. ' +
    '`pageId` must be the id of an existing page from the workspace outline — never invent one.',
  // The live title arrives only through the assemble.ts hydration seam; a bare
  // block (no hydration in reach) falls back to the generic name rather than the
  // raw id, same tolerance as an orphaned reference elsewhere in the registry.
  serialize: (data) => (data as HydratedPageLinkBlock).title?.trim() || 'Page link',
}
