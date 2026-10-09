/**
 * HTML into a page (`Pond 07.11` 7k; `Pond 06.25` 6z frames 2–4): read an HTML file
 * into Pond's own blocks — "text, headings, lists, checklists, tables, databases,
 * charts, quotes, images, files. No html is pasted." — with a list of every part
 * that has no matching block, and why.
 *
 * Server-side and pure over the string. The file is parsed to a syntax tree and
 * read from it: no DOM is built, so no script, handler or `javascript:` link can
 * run, and nothing is fetched — no stylesheet, font, frame or image. Linked images
 * are fetched separately, by `fetchLinkedImages`, under the attachment limit.
 *
 * Deterministic: the same file always reads to the same blocks. Naming, place, kind
 * and the questions are the model's, later, over this reading.
 */
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { blockSchema } from '@/lib/modules/content'
import { checkHtml } from './limits'
import { readDocument } from './reader'
import type { ReadHtmlOptions, ReadHtmlResult } from './types'

export { MAX_HTML_BYTES } from './limits'
export type {
  Counts,
  HtmlReading,
  ImportedDatabase,
  LeftOut,
  ReadHtmlError,
  ReadHtmlOptions,
  ReadHtmlResult,
  TableChoice,
  TableReason,
} from './types'

const countingIds = (): (() => string) => {
  let n = 0
  return () => `import-${++n}`
}

export const readHtml = (html: string, opts: ReadHtmlOptions = {}): ReadHtmlResult => {
  const refused = checkHtml(html)
  if (refused) return { ok: false, error: refused }

  const tree = unified().use(rehypeParse).parse(html)
  const reading = readDocument(tree, {
    mintId: opts.mintId ?? countingIds(),
    baseUrl: opts.baseUrl,
  })
  if (reading.blocks.length === 0 && reading.leftOut.length === 0) {
    return { ok: false, error: { kind: 'unreadable' } }
  }

  // The registry is the authority on what a block is: a reading it rejects is a
  // bug in the reader, never a page.
  return { ok: true, ...reading, blocks: reading.blocks.map((block) => blockSchema.parse(block)) }
}
