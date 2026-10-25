/**
 * A markdown heading line, read the same way wherever a block's prose needs to
 * know if it opens on one: `toc/headings.ts` (lists headings), `templates/summary.ts`
 * (names a bare text block "heading" in the save-sheet line and the outline
 * preview), and `change-log/summary.ts` (counts headings apart from paragraphs).
 * One regex, one parse — so "a text block opens on a heading" can't mean two
 * different things depending on which of those reads it (KAN-482).
 */
import { parseMarkdown } from './markdown'

export interface HeadingLine {
  level: number
  text: string
}

// 1-6 `#`, optional leading whitespace, then a required space and a non-empty
// rest — `\S` right after the required whitespace rejects `#nospace` (no space)
// and `##   ` (only spaces) in one match.
export const HEADING_LINE = /^\s*(#{1,6})\s+(\S.*)$/

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
