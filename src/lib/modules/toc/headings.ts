/**
 * `/table of contents` (KAN-482) — derives the page's headings live from its
 * blocks. Nothing here is persisted: the TOC block stores only its id/type, and
 * this helper recomputes the list on every render from the current siblings.
 */
import type { Block } from '../content'

export interface Heading {
  id: string
  level: number
  text: string
}

// A markdown heading line: 1-6 `#`, then at least one space, then a non-empty
// rest. `\S` after the required whitespace run rejects `#nospace` (no space)
// and `##   ` (only spaces) in one match.
const HEADING_LINE = /^(#{1,6})\s+(\S.*)$/

/** Strip markdown inline marks so a heading reads as plain words. */
function stripInlineMarks(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .trim()
}

/** The page's headings, in block order — only `text` blocks opening on `#{1,6} `. */
export function getHeadings(blocks: readonly Block[]): Heading[] {
  const headings: Heading[] = []
  for (const block of blocks) {
    if (block.type !== 'text') continue
    const firstLine = block.content.split('\n', 1)[0] ?? ''
    const match = HEADING_LINE.exec(firstLine)
    if (!match) continue
    const text = stripInlineMarks(match[2])
    if (!text) continue
    headings.push({ id: block.id, level: match[1].length, text })
  }
  return headings
}
