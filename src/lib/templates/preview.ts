/**
 * The outline a preview draws before a template applies — 6f frame 3: "Moving onto
 * a template draws its blocks on the page as flat outlines, named in mono."
 *
 * The kind word is read off the block's own TYPE (and a view's mode), not
 * `blockFrame()`'s card shape (`summary.ts`'s `blockWord()`): that collapses a
 * labelled text block, a highlight and an image/file into one `list` kind
 * (block-frame.ts:458, :503, :514), which would draw three rows as one. Pure — no
 * clock, no crypto, no DOM.
 */
import type { Block } from '@/lib/modules/content'
import { todoMarker } from '@/lib/modules/todo/schema'
import { TODO_KIND } from '@/lib/modules/block-frame'
import { viewKind } from '@/lib/modules/view/kinds'
import { blockLabel, trimmedOrNone } from '@/lib/modules/types'
import { OPENS_ON_A_HEADING } from './summary'
import { ICON, type SlashIcon } from '@/components/molecules/slash-entries'

export interface TemplateOutlineRow {
  kind: string
  label: string
  height: number
  icon: SlashIcon
}

/**
 * 6f frame 3's row heights, keyed by the outline's own kind word. Kinds the board
 * does not draw: multi-row blocks 110, single-line blocks 44 (the ticket's own
 * ruling).
 */
const HEIGHT_BY_KIND: Record<string, number> = {
  'big number': 92,
  list: 110,
  checklist: 110,
  'entry log': 44,
  text: 44,
  table: 110,
  gallery: 110,
  chart: 110,
  board: 110,
  heading: 44,
  highlight: 44,
  file: 44,
  'page link': 44,
}

/** A kind the board never named (e.g. `timeline`, `calendar`) draws at the multi-row height. */
const DEFAULT_HEIGHT = 110

/**
 * Each block's own kind word. A view's word (and its icon, below) comes from
 * `viewKind()` — the one table that already owns every `ViewMode`'s label — so a
 * mode `viewKind` adds (`timeline`, `calendar`, …) can never be missing here.
 */
function outlineKind(block: Block): string {
  switch (block.type) {
    case 'text':
      return OPENS_ON_A_HEADING(block.content) ? 'heading' : 'text'
    case 'todo':
      return TODO_KIND[todoMarker(block)]
    case 'table':
      return 'table'
    case 'entries':
      return 'entry log'
    case 'highlight':
      return 'highlight'
    case 'image':
      return 'file'
    case 'view':
      return viewKind(block).label
    case 'page-link':
      return 'page link'
    case 'toc':
      return 'contents'
    case 'toggle':
      return 'toggle'
  }
}

/**
 * Each block's own glyph, read directly off the block rather than through a
 * kind-word-keyed map: a map entry can go missing for a word nothing has
 * exercised yet (the bug this function replaced — `KIND_ICON['timeline']` threw).
 * Mirrors `outlineKind()`'s switch so the two can never drift onto different kinds.
 */
function outlineIcon(block: Block): SlashIcon {
  switch (block.type) {
    case 'text':
      return OPENS_ON_A_HEADING(block.content) ? ICON.heading : ICON.text
    case 'todo':
      return todoMarker(block) === 'check' ? ICON.check : ICON.list
    case 'table':
      return ICON.table
    case 'entries':
      return ICON.log
    case 'highlight':
      return ICON.quote
    case 'image':
      return ICON.file
    case 'view':
      return viewKind(block).icon
    case 'page-link':
      return ICON.page
    // KAN-482: no board-drawn mark for this row yet (the `/` row item decides);
    // `list` reads closest to a quiet list of entries.
    case 'toc':
      return ICON.list
    case 'toggle':
      return ICON.toggle
  }
}

function outlineLabel(block: Block): string {
  if (block.type === 'table') return trimmedOrNone(block.title) ?? ''
  return blockLabel(block) ?? ''
}

export function templateOutlineRows(blocks: Block[]): TemplateOutlineRow[] {
  return blocks.map((block) => {
    const kind = outlineKind(block)
    return {
      kind,
      label: outlineLabel(block),
      height: HEIGHT_BY_KIND[kind] ?? DEFAULT_HEIGHT,
      icon: outlineIcon(block),
    }
  })
}
