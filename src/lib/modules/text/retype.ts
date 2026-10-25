import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'
import { proseSchema, numberAttr } from './document'
import { parseMarkdown, serializeMarkdown } from './markdown'

export type TextKind = 'text' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'code'

const HEADING_KIND = { 1: 'heading1', 2: 'heading2', 3: 'heading3' } as const satisfies Record<
  number,
  TextKind
>

/**
 * The single top-level node a text block's markdown parses to, or null when
 * there isn't one to turn into something else: empty content (KAN-345's one
 * empty paragraph), more than one node (a list, two paragraphs — KAN-552 splits
 * those into their own blocks at write time), or a heading past level 3 (turn
 * into has no target for it).
 */
export const textKindOf = (content: string): TextKind | null => {
  const doc = parseMarkdown(content)
  if (doc.childCount !== 1) return null
  const node = doc.firstChild
  if (!node || (node.type.name === 'paragraph' && node.content.size === 0)) return null
  switch (node.type.name) {
    case 'paragraph':
      return 'text'
    case 'blockquote':
      return 'quote'
    case 'codeBlock':
      return 'code'
    case 'heading': {
      const level = numberAttr(node.attrs, 'level')
      return level === 1 || level === 2 || level === 3 ? HEADING_KIND[level] : null
    }
    default:
      return null
  }
}

/** A fragment's text, hard breaks read as `\n` (the schema's `leafText`), marks dropped. */
const plainTextOf = (content: Fragment): string =>
  proseSchema.nodes.paragraph.create(null, content).textContent

/**
 * The inline content a node holds, wherever its kind keeps it: a quote's is one
 * level down, in its (assumed single) paragraph; a code block has none, only text.
 */
const inlineContentOf = (node: ProseNode): Fragment => {
  if (node.type.name === 'blockquote') return node.firstChild?.content ?? Fragment.empty
  if (node.type.name === 'codeBlock') {
    const text = node.textContent
    return text ? Fragment.from(proseSchema.text(text)) : Fragment.empty
  }
  return node.content
}

const retypedNode = (node: ProseNode, kind: TextKind): ProseNode => {
  const inline = inlineContentOf(node)
  switch (kind) {
    case 'text':
      return proseSchema.nodes.paragraph.create(null, inline)
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return proseSchema.nodes.heading.create({ level: Number(kind.slice(-1)) }, inline)
    case 'quote':
      return proseSchema.nodes.blockquote.create(
        null,
        proseSchema.nodes.paragraph.create(null, inline)
      )
    case 'code': {
      const text = plainTextOf(inline)
      return proseSchema.nodes.codeBlock.create(null, text ? proseSchema.text(text) : undefined)
    }
  }
}

/** `content`'s single top node, retyped to `kind`, as markdown. `content` must be a kind `textKindOf` doesn't report null for. */
export const retypeText = (content: string, kind: TextKind): string => {
  const doc = parseMarkdown(content)
  const node = doc.firstChild
  if (!node || doc.childCount !== 1) {
    // Crash early in dev; a caller must check `textKindOf` first.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`retypeText: content is not a single node: ${JSON.stringify(content)}`)
    }
    console.error(`retypeText: content is not a single node: ${JSON.stringify(content)}`)
    return content
  }
  return serializeMarkdown(doc.copy(Fragment.from(retypedNode(node, kind))))
}
