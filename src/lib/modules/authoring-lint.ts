/**
 * AI authoring discipline (ticket-21) — emit-time lint heuristics.
 *
 * The AI is taught (t16 catalog + prompt) to prefer STRUCTURED modules over
 * markdown-shaped prose, but teaching is probabilistic: live, the model sometimes
 * writes a pipe-syntax markdown table INSIDE a `text` block instead of using the
 * real `table` module, and it likes to open an AI-created page with a `##` heading
 * that just repeats the page title. This module is the deterministic backstop.
 *
 * Both heuristics are PURE string predicates (no Zod, no React, no server-only
 * imports) so they are trivially unit-tested with real markdown fixtures and can be
 * wired into the emit-time validation gate as Zod refinements (t16 branch 7). When a
 * refinement fails, the AI SDK's `repairToolCall` pass re-asks the model to correct
 * its arguments — which, for a pipe-table-in-text, means re-emitting as a `table`
 * module. Rejection (not auto-annotation) is the chosen enforcement: it is the only
 * option that yields the STRUCTURED module the registry can render/diff/edit, rather
 * than freezing bad markdown into a text block forever. See ticket-21 Resolution.
 */

/**
 * Corrective messages surfaced to the model on rejection. They name the fix
 * explicitly (use the table module / drop the title-echo heading) so the repair
 * pass produces the right structure rather than reshuffling the same bad text.
 */
export const PIPE_TABLE_IN_TEXT_MESSAGE =
  'This text block contains a markdown pipe table. Tabular data must use the `table` module (columns + rows), never pipe syntax inside a text block. Re-emit this as a `table` module: put the header row in `columns` and each data row in `rows`.'

export const TITLE_ECHO_MESSAGE =
  "The first block repeats the page title as a heading. Do not open a page with a heading that echoes its own title — the title is already shown. Drop that heading block (or replace it with real intro content)."

/** Count the `|` characters in a single line. */
function pipeCount(line: string): number {
  let n = 0
  for (const ch of line) if (ch === '|') n++
  return n
}

/**
 * Is a line the markdown table *separator* row — the `|---|---|` (or `:--:`) rule
 * that sits between the header and the body of a GFM pipe table? Requires at least
 * one pipe and cells composed solely of dashes/colons/whitespace.
 */
function isSeparatorLine(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|')) return false
  if (!/-/.test(t)) return false
  // Every non-pipe character must be a dash, colon, or whitespace.
  return /^[|\s:-]+$/.test(t)
}

/**
 * Detect a markdown pipe table inside a text-block body.
 *
 * Heuristic (deliberately specific to avoid flagging prose that merely contains a
 * `|`): the body must contain a GFM-style table shape —
 *   1. a `|---|` separator line, AND
 *   2. at least two OTHER lines (header + ≥1 body row), each with ≥2 pipes,
 *      forming a run around the separator.
 *
 * Requiring the separator line is what keeps legitimate prose safe: a sentence like
 * "choose A | B | C" or a single "key | value" line has no `|---|` rule, so it is
 * never flagged. A real emitted table always carries the separator.
 */
export function isMarkdownPipeTable(content: string): boolean {
  const lines = content.split('\n')
  const sepIdx = lines.findIndex(isSeparatorLine)
  if (sepIdx === -1) return false

  // Count content rows (≥2 pipes) that are NOT the separator itself. A real table
  // has a header row above the separator and at least one body row below it — i.e.
  // ≥2 such rows total, and they must be adjacent to the separator (a contiguous
  // block), not scattered pipes elsewhere in prose.
  const pipeRows = (idx: number): boolean => {
    const line = lines[idx]
    return line !== undefined && !isSeparatorLine(line) && pipeCount(line) >= 2
  }

  // Header: the line immediately above the separator must be a pipe row.
  const hasHeader = sepIdx > 0 && pipeRows(sepIdx - 1)
  // Body: at least one pipe row immediately below the separator.
  const hasBody = pipeRows(sepIdx + 1)

  return hasHeader && hasBody
}

/** Strip a single leading emoji / symbol run and surrounding whitespace, then
 *  lowercase — so "## 📚 Fall Reading List" and "Fall Reading List" compare equal. */
function normalizeHeadingText(s: string): string {
  return s
    .replace(/[#*_`]/g, '') // markdown emphasis/heading marks
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '') // emoji
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Is `content` a markdown heading whose text echoes `title`?
 *
 * The observed anti-pattern: an AI-created page's FIRST block is a text block
 * `## 📚 Fall Reading List` sitting directly under the page title "Fall Reading
 * List". A heading is a line beginning with `#`; a leading emoji is ignored. We only
 * flag when the heading's normalized text EQUALS the normalized title (title echo),
 * never a heading that merely mentions the title inside a longer line.
 */
export function isTitleEchoHeading(content: string, title: string): boolean {
  const firstLine = content.split('\n')[0] ?? ''
  const trimmed = firstLine.trim()
  if (!trimmed.startsWith('#')) return false
  // Strip the leading `#` run to get the heading text.
  const headingBody = trimmed.replace(/^#+\s*/, '')
  const t = normalizeHeadingText(title)
  if (t.length === 0) return false
  return normalizeHeadingText(headingBody) === t
}
