/**
 * A page's blocks → the template's blocks (KAN-10 / #157, board `6i` frame 4).
 *
 * The board is explicit about what a saved template is, and it is NOT a copy of
 * the page: "Structure and labels by default. The content of this page stays
 * behind unless ticked" — "by default a saved template is the stack, the labels
 * and the placeholders."
 *
 * So the default strips content and keeps shape. What "shape" means per block is
 * the whole of this module:
 *
 *   - every block keeps its `type` and its `label` (the card's eyebrow — the
 *     labels the board names)
 *   - a `todo` keeps its `marker`, because a checklist and a bullet list are
 *     different shapes, and gets one empty row so the placeholder is visible
 *   - a `table` keeps its `columns` (and `title`); its rows go
 *   - a `view` keeps its `mode` and `chart` config, and DROPS `collectionId` —
 *     see below
 *   - `entries` keeps its `serif` flag, which is what makes a journal a journal
 *   - `text`, `highlight` and `image` are content-only, so they become empty
 *     blocks of their type
 *
 * The seven above ARE the whole `Block` union, so the switch is exhaustive and a
 * new block type will fail to compile here rather than silently copying its
 * content into a template. (`page` is not in the union — it is the withheld
 * structural type, see `modules/palette.ts`'s `WITHHELD`.)
 *
 * `collectionId` is dropped deliberately. It names ONE database, and a template
 * is a shape you copy, never a tie — `provenance.ts` is explicit that a page
 * made from a template holds a copy, not a reference. Carrying the id would make
 * every page made from the template read the original's records, which is a
 * cross-page link nobody asked for and, once ponds exist, a cross-POND one.
 *
 * Ids are minted fresh for the same reason: a template's blocks must not share
 * ids with the page it came from, or the diff path would treat edits to one as
 * edits to the other.
 *
 * Pure, and `mintId` is injected — no crypto, no clock, so the table below is
 * exhaustively testable.
 */

import type { Block } from '@/lib/modules/content'

/** What the sheet's one tick changes (board `6i` frame 4). */
export interface TemplateFromPageOptions {
  /**
   * Ticked: keep this page's content verbatim instead of placeholders. Off by
   * default — the board's default is structure and labels.
   */
  keepContent?: boolean
}

/**
 * The blocks a saved template carries, from the page's own.
 *
 * With `keepContent`, the blocks are copied as they are (with fresh ids). Without
 * it — the default — each block keeps its shape and loses its content.
 */
export function templateBlocksFrom(
  blocks: readonly Block[],
  mintId: () => string,
  opts: TemplateFromPageOptions = {}
): Block[] {
  return blocks.map((block) =>
    opts.keepContent ? withoutTie(block, mintId()) : emptied(block, mintId)
  )
}

/**
 * A block copied with its content, minus any tie to another page.
 *
 * `collectionId` goes even here. Ticking "this page's content" asks for the
 * page's own content, and a `view`'s records are NOT its own — they live in a
 * database page. Carrying the id would make every page made from this template
 * read that one database, and once the template is used in another pond that is
 * a cross-pond read of the kind #323 removed everywhere else.
 *
 * OPEN (KAN-10): the board's tick says "this page's content" and does not say
 * what that means for a view, whose content is a live reference. This takes the
 * conservative reading — shape, never a tie — which matches `provenance.ts`'s
 * copy-not-a-tie rule. Worth confirming against `6i` frame 4 before it ships.
 */
function withoutTie(block: Block, id: string): Block {
  if (block.type !== 'view') return { ...block, id }
  const next = { ...block, id }
  delete next.collectionId
  return next
}

/** One block, keeping its shape and losing its content. */
function emptied(block: Block, mintId: () => string): Block {
  const id = mintId()
  // `label` is on every type and is the eyebrow the board calls a "label", so it
  // is preserved in every branch below rather than conditionally.
  switch (block.type) {
    case 'text':
      return { ...block, id, content: '' }

    case 'highlight':
      return { ...block, id, content: '' }

    case 'image':
      return { ...block, id, url: '' }

    case 'todo':
      // The marker survives: `check`, `dot` and plain are three different shapes,
      // not three decorations. One empty row, matching `emptyBlockForType`, so the
      // placeholder row is drawn rather than the block's empty state.
      return { ...block, id, items: [{ id: mintId(), label: '', checked: false }] }

    case 'table':
      // Columns are the shape; rows are the content. Two empty rows is the same
      // fresh-table shape `emptyBlockForType` makes.
      return {
        ...block,
        id,
        rows: [
          { id: mintId(), cells: block.columns.map(() => '') },
          { id: mintId(), cells: block.columns.map(() => '') },
        ],
      }

    case 'entries':
      // `serif` is what makes a journal a journal, so it stays. No entries, so the
      // block draws its own empty line.
      return { ...block, id, entries: [] }

    case 'view': {
      // `collectionId` is a tie to one database, not a shape — see the header.
      // Deleted off a copy rather than destructured, so no unused binding.
      const next = { ...block, id }
      delete next.collectionId
      return next
    }
  }
}
