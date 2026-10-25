/**
 * Whether deleting this block would throw away something the person put in it.
 * An empty line, a blank checklist, a blank log and an unfilled table go
 * straight to the undo toast. A block that already holds writing, a file, a
 * page, or a view of records asks first.
 */

import type { Block } from './content'
import { TEXT_MARKUP } from './text/markup'
import { blockLabel } from './types'

const written = (value: string | undefined) => (value ?? '').trim() !== ''

/**
 * A line-prefix marker, generalised to strip any run of its syntax so a
 * retyped or renumbered line (any heading level, not just the `##`
 * `/heading` mints) is still caught. `code` and `divider` aren't here: a
 * fence wraps its content rather than prefixing it (handled separately
 * below), and `---` *is* the divider's whole content — it has no "written"
 * state to detect. `heading`, `quote` and `numbered-list` reuse the exact
 * strings `TEXT_MARKUP` (markup.ts, the one home for those) mints; `bulleted`
 * has no row of its own there — the palette's `bulleted-list` row mints a
 * `todo` block instead (palette.ts) — it is only ever typed directly, via
 * the editor's markdown input rule, so its marker's one home is here.
 */
const MARKER_PATTERNS: Record<string, RegExp> = {
  heading: /^#{1,6}\s*/,
  quote: /^>\s*/,
  'numbered-list': /^\d+\.\s*/,
  bulleted: /^-\s*/,
}

/**
 * A text block still waiting for the person: blank, or only the bare
 * scaffolding a markup row (`TEXT_MARKUP`) mints before anything is typed
 * after it — a heading, quote, numbered-list or bulleted-list marker
 * (KAN-558, commit 21dd357d started this with the heading case) or an empty
 * code fence. Either is empty — nothing a delete or an exit would throw away.
 */
export const textIsVacant = (value: string | undefined) => {
  const content = value ?? ''
  if (content === TEXT_MARKUP.code) return true
  return Object.values(MARKER_PATTERNS).some((marker) => content.replace(marker, '').trim() === '')
}

export function blockHoldsContent(block: Block): boolean {
  switch (block.type) {
    case 'text':
      return !textIsVacant(block.content)
    case 'highlight':
      return written(block.content)
    case 'todo':
      return block.items.some((item) => written(item.label) || item.checked)
    case 'table':
      return (block.rows ?? []).some((row) => row.cells.some((cell) => written(cell)))
    case 'entries':
      return block.entries.some((entry) => written(entry.text))
    case 'image':
      return written(block.url)
    case 'page-link':
    case 'view':
      return true
    // KAN-558: holds nothing the person wrote — only `text` can vanish on
    // exit (below), so a toc no longer needs this `true` to survive it.
    // Its delete goes straight to the undo toast, like a blank checklist.
    case 'toc':
      return false
    // KAN-480: a summary with no body yet still holds something once either
    // line is written.
    case 'toggle':
      return written(block.content) || written(block.body)
    default: {
      const unreachable: never = block
      return unreachable
    }
  }
}

/**
 * Whether leaving this block empty takes it off the page (KAN-558). True only
 * for an unlabelled `text` block with nothing written — a blank line, or a
 * bare heading, quote, numbered-list, bulleted-list or code-fence marker,
 * same as `blockHoldsContent`'s own text case (`textIsVacant`, above). Every
 * other block type is a deliberate structure (a checklist, a table, a toc):
 * it stays until the person deletes it, which is the different question
 * `blockHoldsContent` answers.
 */
export function removedOnExit(block: Block): boolean {
  if (block.type !== 'text') return false
  if (blockLabel(block)) return false
  return textIsVacant(block.content)
}
