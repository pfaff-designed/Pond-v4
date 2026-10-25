/**
 * A markdown heading line's regex, read the same way wherever a block's prose
 * needs to know if it opens on one: `toc/headings.ts` and `heading-words.ts`
 * (lists/names headings), `templates/summary.ts` and `templates/preview.ts`
 * (names a bare text block "heading" in the save-sheet line and the outline
 * preview), and `change-log/summary.ts` (counts headings apart from
 * paragraphs). One regex — so "a text block opens on a heading" can't mean
 * two different things depending on which of those reads it (KAN-482).
 *
 * Pure regex only, no `parseMarkdown` import: `templates/summary.ts` and
 * `change-log/summary.ts` only ever need the yes/no test, not the heading's
 * plain words, so they have no reason to pull in the ProseMirror parser
 * (`heading-words.ts` is that parser-based reader).
 */

// 1-6 `#`, optional leading whitespace, then a required space and a non-empty
// rest — `\S` right after the required whitespace rejects `#nospace` (no space)
// and `##   ` (only spaces) in one match. Anchored to one line: callers test it
// against a single line, never a whole multi-line `block.content`.
export const HEADING_LINE = /^\s*(#{1,6})\s+(\S.*)$/

/** Whether a (possibly multi-line) block's prose opens on a heading — only its first line counts. */
export function opensOnAHeading(content: string): boolean {
  const firstLine = content.split('\n', 1)[0] ?? ''
  return HEADING_LINE.test(firstLine)
}
