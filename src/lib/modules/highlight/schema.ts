import { z } from 'zod'
import { labelledBlockFields, type ModuleDescriptor } from '../types'

/**
 * `highlight` (#249, child 228a of #228) — a passage the person kept. Wheat's one
 * legal job: `PROJECT_RULES.md` confines `#FFEFAE` to "highlighted passages, and
 * only those — always carries ink text". A block under ADR 0007's sorting rule
 * (authored content, not an aggregation of records), measured off
 * `PondTemplate.dc.html`'s `renderVals()` (`k === 'highlight'`).
 *
 * The passage is plain text, not markdown — the board sets one serif line, and a
 * highlight is something kept verbatim, not composed. An empty `content` is the
 * authoring state: the view shows the board's empty line with NO wheat ground
 * (wheat appears only when there is a passage).
 *
 * NOT the inline `highlight` atom in `PondAtom.tsx` — that is a marked span inside
 * prose from `PondAtom.dc.html` (`px-[3px]`, 17.5px, leading-relaxed). The two share
 * the tokens and nothing else; a value in a board is final, so do not reconcile them.
 *
 * `label` (#258): the reading list labels this block `kept` (`['highlight', 'kept',
 * …]` in the board's `T` table), and `hasEyebrow: !!label` — so the label is the
 * block's own persisted field and `blockFrame()` reads it as the eyebrow, falling
 * back to the kind. The shared mixin, declared once in `types.ts`.
 */
export const highlightSchema = z
  .object({
    id: z.string(),
    type: z.literal('highlight'),
    /** The kept passage, plain text. Empty string = nothing kept yet. */
    content: z.string(),
  })
  .extend(labelledBlockFields)

export type HighlightBlock = z.infer<typeof highlightSchema>

/**
 * The board's empty line for a highlight (`PondTemplate.dc.html`, the reading list's
 * `e:` value) — lowercase, in the product's voice. Doubles as the editing placeholder.
 */
export const HIGHLIGHT_EMPTY_LINE = 'a line worth keeping'

export const highlightDescriptor: ModuleDescriptor<HighlightBlock> = {
  type: 'highlight',
  schema: highlightSchema,
  paletteDescription: 'A passage worth keeping — one line set apart on wheat.',
  description:
    'A highlight: ONE short passage the person wants to keep — a line from a book, a quote, a sentence worth returning to — set apart on a wheat ground. ' +
    'Use a plain text block for notes, explanations and ordinary writing; use a highlight only for a passage worth keeping verbatim. ' +
    'It is not a callout, banner, warning or summary box — Pond has none of those.',
  // `blocksToText` joins serialized lines with no type label, so bare content would
  // read as prose and come back as a `text` block on a wholesale re-emit. The marker
  // keeps a highlight a highlight.
  serialize: (data) =>
    data.content.trim() ? `Highlight: ${data.content}` : 'Highlight: (no passage kept yet)',
}
