/**
 * "what this template will contain" — `Pond 06.09` (`6i`) frame 3's summary line,
 * drawn between the last `keep` box and the buttons:
 *
 *     6 blocks — big number, list, checklist, heading, text, entry log
 *
 * It names every block in PAGE ORDER, so you can see the shape you are about to
 * save before you commit to it.
 *
 * ## Where the names come from
 *
 * Two existing owners, not a new vocabulary:
 *
 *   - A block the frame gives a KIND is named by that kind — `blockFrame()`'s own
 *     `PondBlockKind`, which is the board's enum. Two of the seven read differently
 *     in prose than as a slug, and the board writes the prose: `number` → "big
 *     number", `log` → "entry log". The other five are already their own words.
 *   - A block the frame returns `null` for is BARE: an unlabelled `text` block
 *     (`PondTemplate.dc.html`: `bare = k === 'text' && !label`) names itself
 *     "heading" when the prose opens on a markdown heading, else "text"; a board or
 *     chart-card view names itself by its mode.
 *
 * That last split is not invented here. `modules/palette.ts` already rules it:
 * "`heading` is the `text` block opened on a markdown heading, not a block kind" —
 * `PondBlock` and ADR 0007 name no heading kind, and `HEADING_PREFIX` is what
 * `/heading` types. So a heading is a text block that starts with `#`s, at any
 * level: the board's own example counts a `heading` and a `text` separately from
 * one `text` descriptor.
 *
 * Pure — no clock, no crypto, no DOM.
 */

import type { Block } from '@/lib/modules/content'
import { blockFrame } from '@/lib/modules/block-frame'
import type { PondBlockKind } from '@/lib/modules/block-frame'

/**
 * The two frame kinds whose slug is not how the board says it. Everything else in
 * `POND_BLOCK_KINDS` (list · checklist · table · gallery · properties) is already
 * the word the board uses.
 */
const KIND_WORD: Partial<Record<PondBlockKind, string>> = {
  number: 'big number',
  log: 'entry log',
}

/** A markdown heading at any level — `#` through `######`, per `HEADING_PREFIX`. */
const OPENS_ON_A_HEADING = /^\s*#{1,6}\s+\S/

/** What one block is called in the summary line. */
export function blockWord(block: Block): string {
  const frame = blockFrame(block)
  // `kind` is guarded as well as `frame`: the frame for a view whose `mode` is
  // not one of `VIEW_MODES` comes back shaped but kindless, and a summary line
  // must never render `undefined` at the person.
  if (frame?.kind) return KIND_WORD[frame.kind] ?? frame.kind
  // No frame: bare prose, or a view that sits on the page without a card — the
  // board's lanes and the chart card — which the board names by its mode.
  if (block.type === 'view' && (block.mode === 'board' || block.mode === 'chart')) return block.mode
  if (block.type === 'text') {
    return OPENS_ON_A_HEADING.test(block.content) ? 'heading' : 'text'
  }
  // Defensive: a future block type with no frame and no prose still gets a word
  // rather than an empty slot in the line.
  return block.type
}

/**
 * The board's line, whole: `6 blocks — big number, list, checklist, …`.
 *
 * Singular at one block ("1 block"), and an empty page says so rather than
 * trailing an em dash with nothing after it — the page you are saving may be
 * empty, and the sheet still has to draw this row.
 */
export function templateSummary(blocks: readonly Block[]): string {
  if (blocks.length === 0) return 'no blocks yet'
  const noun = blocks.length === 1 ? 'block' : 'blocks'
  return `${blocks.length} ${noun} — ${blocks.map(blockWord).join(', ')}`
}
