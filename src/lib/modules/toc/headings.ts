/**
 * `/table of contents` (KAN-482) — derives the page's headings live from its
 * blocks. Nothing here is persisted: the TOC block stores only its id/type, and
 * this helper recomputes the list on every render from the current siblings.
 */
import type { Block } from '../content'
import { headingLine } from '../text/heading-words'

export interface Heading {
  id: string
  level: number
  text: string
}

/** The page's headings, in block order — only `text` blocks opening on `#{1,6} `. */
export function getHeadings(blocks: readonly Block[]): Heading[] {
  const headings: Heading[] = []
  for (const block of blocks) {
    if (block.type !== 'text') continue
    const firstLine = block.content.split('\n', 1)[0] ?? ''
    const heading = headingLine(firstLine)
    if (!heading) continue
    headings.push({ id: block.id, level: heading.level, text: heading.text })
  }
  return headings
}
