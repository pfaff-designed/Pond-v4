/**
 * Whether deleting this block would throw away something the person put in it.
 * An empty line, a blank checklist, a blank log and an unfilled table go
 * straight to the undo toast. A block that already holds writing, a file, a
 * page, or a view of records asks first.
 */

import type { Block } from './content'

const written = (value: string | undefined) => (value ?? '').trim() !== ''

export function blockHoldsContent(block: Block): boolean {
  switch (block.type) {
    case 'text':
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
    // KAN-482: derives its content from the page's own headings, so it is
    // never "empty" the way a blank line or an unfilled table is.
    case 'toc':
      return true
    default: {
      const unreachable: never = block
      return unreachable
    }
  }
}
