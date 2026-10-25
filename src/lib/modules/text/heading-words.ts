/**
 * A heading line's level and plain words, for `toc/headings.ts` (the only
 * caller that needs more than a yes/no test — see `heading-line.ts`).
 */
import { parseMarkdown } from './markdown'
import { HEADING_LINE } from './heading-line'

export interface HeadingLine {
  level: number
  text: string
}

/**
 * A line's heading level and plain words, or null if it isn't a heading line.
 * The words come from parsing just that line as markdown and reading the
 * heading node's `textContent`, so inline marks (`**bold**`, `` `code` ``) are
 * stripped and a markup-looking literal with no surrounding whitespace
 * (`my_var_name`) is told apart from real emphasis the way the editor already
 * tells them apart, rather than by a second, hand-rolled regex.
 */
export function headingLine(line: string): HeadingLine | null {
  const match = HEADING_LINE.exec(line)
  if (!match) return null
  const doc = parseMarkdown(`${match[1]} ${match[2]}`)
  const text = doc.firstChild?.type.name === 'heading' ? doc.firstChild.textContent.trim() : ''
  if (!text) return null
  return { level: match[1].length, text }
}
