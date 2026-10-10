import { createContext } from 'react'
import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'
import { serializeMarkdown } from './markdown'
import type { TextBlock } from './schema'

/**
 * A `/` line inside a text block: a plain top-level line that starts with `/`,
 * with the block's markdown on either side of it. The `/` menu reads its query
 * off it, and a pick splits the block there.
 */
export interface SlashLine {
  before: string
  /** The line itself, `/` and the query. */
  line: string
  after: string
  query: string
}

/** Told about the `/` line under the caret; `opened` when the `/` was just typed. */
export type SlashLineListener = (line: SlashLine | null, opened: boolean) => void

/** Provided by the page around a text block whose `/` lines it can split. */
export const SlashLineContext = createContext<SlashLineListener | null>(null)

const markdownOf = (doc: ProseNode, from: number, to: number): string => {
  const children: ProseNode[] = []
  doc.forEach((child, _offset, index) => {
    if (index >= from && index < to) children.push(child)
  })
  return serializeMarkdown(doc.copy(Fragment.fromArray(children)))
}

/** The top-level paragraph the caret is directly in, by index. */
const lineIndexAt = (doc: ProseNode, pos: number): number | null => {
  const at = doc.resolve(pos)
  if (at.depth !== 1 || at.parent.type.name !== 'paragraph') return null
  return at.index(0)
}

/**
 * The `/` line under the caret, or null. A block that is only that line is not
 * one: the empty block's own `/` path replaces the whole block.
 */
export const slashLineAt = (doc: ProseNode, pos: number): SlashLine | null => {
  if (doc.childCount < 2) return null
  const index = lineIndexAt(doc, pos)
  if (index === null) return null
  const text = doc.child(index).textContent
  if (!text.startsWith('/')) return null
  return {
    before: markdownOf(doc, 0, index),
    line: markdownOf(doc, index, index + 1),
    after: markdownOf(doc, index + 1, doc.childCount),
    query: text.slice(1),
  }
}

/** Was `/` just typed at the start of an empty line (`was` is the doc before it)? */
export const opensSlashLine = (was: ProseNode, doc: ProseNode, pos: number): boolean => {
  if (doc.childCount < 2 || was.childCount !== doc.childCount) return false
  const index = lineIndexAt(doc, pos)
  if (index === null || doc.child(index).textContent !== '/') return false
  const line = was.child(index)
  return line.type.name === 'paragraph' && line.content.size === 0
}

/**
 * The block split around its `/` line: the part above keeps the block, the line
 * becomes a block of its own (`host`, which the pick replaces), and the part below
 * is a new block. An empty side makes no block; with nothing above, the line
 * keeps the block's id.
 */
export const splitAtSlashLine = (
  block: TextBlock,
  line: SlashLine,
  mintId: () => string
): { blocks: TextBlock[]; host: TextBlock } => {
  const keepsAbove = line.before.trim() !== ''
  const above: TextBlock[] = keepsAbove ? [{ ...block, content: line.before }] : []
  const host: TextBlock = { id: keepsAbove ? mintId() : block.id, type: 'text', content: line.line }
  const below: TextBlock[] =
    line.after.trim() !== '' ? [{ id: mintId(), type: 'text', content: line.after }] : []
  return { blocks: [...above, host, ...below], host }
}
