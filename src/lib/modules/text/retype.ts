import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'
import { proseSchema, numberAttr } from './document'
import { parseMarkdown, serializeMarkdown } from './markdown'

export type TextKind =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'quote'
  | 'code'

/**
 * The single top-level node a text block's markdown parses to, or null when
 * there isn't one to turn into something else: empty content (KAN-345's one
 * empty paragraph), more than one node (a list, two paragraphs — KAN-552 splits
 * those into their own blocks at write time). A heading reads as its own kind
 * at every level 1-6, even past the three levels `conversions.ts` offers as
 * targets — it is still one node a person can turn into text, quote, code or
 * a heading 1-3.
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
      // Anything but a single paragraph (another paragraph, a list) has no single
      // inline run to carry across a retype, so it isn't a turn-into target.
      return node.childCount === 1 && node.firstChild?.type.name === 'paragraph'
        ? 'quote'
        : null
    case 'codeBlock':
      return 'code'
    case 'heading': {
      const level = numberAttr(node.attrs, 'level')
      return level !== null && level >= 1 && level <= 6 ? (`heading${level}` as TextKind) : null
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

/**
 * A heading is one line in markdown, so a line break inside one becomes a
 * space: a hard break node (already turned into a space by the serializer's
 * own heading case) and a raw `\n` inside a text node (a code block's
 * content, which the inline tokenizer never breaks into hard breaks) both
 * collapse here, before the node is even built.
 */
const joinLines = (content: Fragment): Fragment =>
  Fragment.from(
    content.content.map((child) => {
      if (child.type.name === 'hardBreak') return proseSchema.text(' ')
      if (child.isText) return proseSchema.text((child.text ?? '').replace(/\n/g, ' '), child.marks)
      return child
    })
  )

const retypedNode = (node: ProseNode, kind: TextKind): ProseNode => {
  const inline = inlineContentOf(node)
  switch (kind) {
    case 'text':
      return proseSchema.nodes.paragraph.create(null, inline)
    case 'quote':
      return proseSchema.nodes.blockquote.create(
        null,
        proseSchema.nodes.paragraph.create(null, inline)
      )
    case 'code': {
      const text = plainTextOf(inline)
      return proseSchema.nodes.codeBlock.create(null, text ? proseSchema.text(text) : undefined)
    }
    // Every other TextKind is `heading${level}` — the level lives in the kind string itself.
    default:
      return proseSchema.nodes.heading.create({ level: Number(kind.slice(-1)) }, joinLines(inline))
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
