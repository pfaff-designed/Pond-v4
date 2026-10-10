import { createContext } from 'react'
import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'
import type { Block } from '../content'
import { serializeMarkdown } from './markdown'
import type { TextBlock } from './schema'

/**
 * A `/` line inside a text block: a plain top-level line that starts with `/`,
 * with the block's markdown on either side of it. The `/` menu reads its query
 * off it, and a pick splits the block there.
 */
export interface SlashLine {
  before: string
  /** The line itself, `/` and the query, as markdown. */
  markdown: string
  after: string
  query: string
}

/** A `/` line and the element that draws it, for anchoring what the pick opens. */
export interface SlashLineAt {
  line: SlashLine
  element: Element | null
}

/** Told about the `/` line under the caret; `opened` when the `/` was just typed. */
export type SlashLineListener = (at: SlashLineAt | null, opened: boolean) => void

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
    markdown: markdownOf(doc, index, index + 1),
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
 * The block split around its `/` line, with `inserted` in the line's place. The
 * block's identity — id and label — stays with the prose above, or with the prose
 * below when there is none above. With no prose left on either side, `inserted`
 * takes the identity: it replaces the block. `inserted` is the block as it lands.
 *
 * With nothing inserted there is nothing to split around: the `/` line goes and
 * the block stays one block, or goes too when it held nothing else.
 */
export const splitAtSlashLine = (
  block: TextBlock,
  line: SlashLine,
  inserted: Block | null,
  mintId: () => string
): { blocks: Block[]; inserted: Block | null } => {
  const hasAbove = line.before.trim() !== ''
  const hasBelow = line.after.trim() !== ''
  if (!inserted) {
    if (!hasAbove && !hasBelow) return { blocks: [], inserted }
    const content = [line.before, line.after].filter((s) => s.trim() !== '').join('\n\n')
    return { blocks: [{ ...block, content }], inserted }
  }
  const placed = [inserted]
  if (hasAbove) {
    const below: Block[] = hasBelow ? [{ id: mintId(), type: 'text', content: line.after }] : []
    return { blocks: [{ ...block, content: line.before }, ...placed, ...below], inserted }
  }
  if (hasBelow) return { blocks: [...placed, { ...block, content: line.after }], inserted }
  const replacing: Block = {
    ...inserted,
    id: block.id,
    ...(block.label === undefined ? {} : { label: block.label }),
  }
  return { blocks: [replacing], inserted: replacing }
}
