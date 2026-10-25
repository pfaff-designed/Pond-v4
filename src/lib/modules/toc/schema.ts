import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { textSchema } from '../text/schema'
import { getHeadings } from './headings'

/**
 * `toc` (KAN-482) — `/table of contents`: a live list of the page's own headings,
 * indented by level, each jumping to its heading. Stores nothing but its id/type
 * (+ the standard width fields, extended on in `content.ts` as every block gets):
 * the headings are derived from the page's current blocks on every render
 * (`headings.ts`), never persisted, so the list can never drift from the page.
 */
export const tocSchema = z.object({
  id: z.string(),
  type: z.literal('toc'),
})
export type TocBlock = z.infer<typeof tocSchema>

/** The board's empty line for a table of contents with no headings yet. */
export const TOC_EMPTY_LINE = 'no headings yet'

export const tocDescriptor: ModuleDescriptor<TocBlock> = {
  type: 'toc',
  label: 'table of contents',
  schema: tocSchema,
  description:
    "A table of contents: a live, read-only list of this page's own headings, indented by level, " +
    'each entry jumping to its heading. It stores nothing of its own and always reflects the page as ' +
    "it is now. Use it once per page, near the top; it is not a link to another page, and it has no " +
    'content to set when creating one.',
  // The headings live with the SIBLINGS, not on this block — `siblings` is the one
  // seam a module whose display derives from page state reads them through
  // (types.ts). Without siblings in reach (a caller that has no page in hand) this
  // says so rather than guessing a list; `blocksToText`/`blockPreview` always pass
  // the page's blocks, so the model and the person see the same headings.
  serialize: (_data, siblings) => {
    if (siblings === undefined) return 'Table of contents (no page in reach to read headings from)'
    // Siblings arrive as `readonly unknown[]` (types.ts) from contexts that assemble
    // a page's blocks for the model — a malformed one (a stray number, a text block
    // with no content) must not throw inside serialize. `getHeadings` only ever
    // reads text blocks, so narrow each sibling against `textSchema` and skip
    // whatever fails, rather than casting.
    const textBlocks = siblings.flatMap((sibling) => {
      const parsed = textSchema.safeParse(sibling)
      return parsed.success ? [parsed.data] : []
    })
    const headings = getHeadings(textBlocks)
    if (headings.length === 0) return `Table of contents: (${TOC_EMPTY_LINE})`
    return [
      'Table of contents:',
      ...headings.map((h) => `${'  '.repeat(h.level - 1)}- ${h.text}`),
    ].join('\n')
  },
}
