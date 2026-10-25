import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'
import type { Block } from '../content'
import { parseMarkdown, serializeMarkdown } from './markdown'

/** `doc`'s top-level children, with an empty paragraph (KAN-345's one-empty-line rule) dropped. */
const topLevelChildren = (doc: ProseNode): ProseNode[] => {
  const children: ProseNode[] = []
  doc.forEach((child) => {
    if (child.type.name === 'paragraph' && child.content.size === 0) return
    children.push(child)
  })
  return children
}

/** Next `<id>-2`, `<id>-3`, … not already taken on the page; reserves it in `usedIds` for the caller. */
const mintId = (id: string, usedIds: Set<string>, nextSuffix: { n: number }): string => {
  let candidate = `${id}-${nextSuffix.n}`
  while (usedIds.has(candidate)) {
    nextSuffix.n += 1
    candidate = `${id}-${nextSuffix.n}`
  }
  nextSuffix.n += 1
  usedIds.add(candidate)
  return candidate
}

/**
 * A stored `text` block, one handle per top-level markdown node (KAN-552). A
 * list, a code fence and a blockquote are each a single top-level node, so they
 * stay one block. `label`, `placeholder`, `pondStampAt`, `width` and `rowStart`
 * stay on the first part only — the later parts are full-width lines of their own.
 * A single-node block, or a fully-empty one, is returned as the SAME object (no
 * split looks like an edit). `usedIds` holds every id already on the page, so a
 * derived id never collides with a stored one (KAN-552 fix: a re-split on reload
 * must not mint an id another block already has).
 */
const splitTextBlock = (block: Block, usedIds: Set<string>): Block[] => {
  if (block.type !== 'text') return [block]
  if (typeof block.content !== 'string') {
    // Crash early in dev; a corrupted stored block must not break the whole page/home/template load.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`splitStoredText: block ${block.id}'s content is not a string`)
    }
    console.error(`splitStoredText: block ${block.id}'s content is not a string`)
    return [block]
  }
  const doc = parseMarkdown(block.content)
  const children = topLevelChildren(doc)
  if (children.length <= 1) return [block]
  const nextSuffix = { n: 2 }
  return children.map((child, index) => {
    const content = serializeMarkdown(doc.copy(Fragment.from(child)))
    if (index === 0) return { ...block, content }
    // Named only to drop them from `rest`: the first part keeps label/placeholder/pondStampAt/width/rowStart.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { label, placeholder, pondStampAt, width, rowStart, ...rest } = block
    return { ...rest, id: mintId(block.id, usedIds, nextSuffix), content }
  })
}

/** Every stored block, with each multi-paragraph `text` block split into one block per top-level node. */
export const splitStoredText = (blocks: Block[]): Block[] => {
  const usedIds = new Set(blocks.map((block) => block.id))
  return blocks.flatMap((block) => splitTextBlock(block, usedIds))
}
