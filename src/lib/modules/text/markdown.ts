import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import {
  MarkdownParser,
  MarkdownSerializer,
  type MarkdownSerializerState,
} from 'prosemirror-markdown'
import type { Mark, Node as ProseNode } from '@tiptap/pm/model'
import { proseSchema } from './extensions'

/**
 * The text block's markdown `content` ⇄ the editor's document.
 *
 * Parsing follows the rules stored blocks were written under: GFM inline syntax,
 * a single newline is a line break, no raw HTML. Tables and images
 * have no node in a text block, so their rules are off and their characters stay
 * text instead of being dropped.
 */
const tokenizer = new MarkdownIt('default', { html: false, linkify: true }).disable([
  'table',
  'image',
])
tokenizer.linkify.set({ fuzzyLink: false })

const isTight = (tokens: Token[], index: number): boolean => {
  const next = tokens.slice(index + 1).find((token) => token.type !== 'list_item_open')
  return next?.hidden ?? false
}

const parser = new MarkdownParser(proseSchema, tokenizer, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'listItem' },
  bullet_list: {
    block: 'bulletList',
    getAttrs: (token, tokens, index) => ({
      tight: isTight(tokens, index),
      bullet: token.markup || '-',
    }),
  },
  ordered_list: {
    block: 'orderedList',
    getAttrs: (token, tokens, index) => ({
      start: Number(token.attrGet('start')) || 1,
      tight: isTight(tokens, index),
    }),
  },
  heading: { block: 'heading', getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
  code_block: { block: 'codeBlock', noCloseToken: true },
  fence: {
    block: 'codeBlock',
    getAttrs: (token) => ({ language: token.info.trim() || null }),
    noCloseToken: true,
  },
  hr: { node: 'horizontalRule' },
  hardbreak: { node: 'hardBreak' },
  softbreak: { node: 'hardBreak' },
  em: { mark: 'italic' },
  strong: { mark: 'bold' },
  s: { mark: 'strike' },
  link: {
    mark: 'link',
    getAttrs: (token) => ({ href: token.attrGet('href'), title: token.attrGet('title') || null }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
})

/** A link whose text IS its address (as the autolinker and linkify make) writes back bare. */
const isBareLink = (mark: Mark, parent: ProseNode, index: number): boolean => {
  const child = parent.child(index)
  if (mark.attrs.title || !child.isText) return false
  const text = child.text ?? ''
  const href = String(mark.attrs.href ?? '')
  const sameAddress = [text, `http://${text}`, `https://${text}`, `mailto:${text}`].includes(href)
  const endsHere = index === parent.childCount - 1 || !mark.isInSet(parent.child(index + 1).marks)
  return sameAddress && endsHere && child.marks[child.marks.length - 1] === mark
}

const escapeHref = (href: string): string => href.replace(/[()"]/g, '\\$&')

/** Fence longer than any backtick run inside, so the code can never close it early. */
const fenceFor = (code: string): string => {
  const longest = Math.max(2, ...(code.match(/`{3,}/g) ?? []).map((run) => run.length))
  return '`'.repeat(longest + 1)
}

/** Inline code delimiters that out-count any backtick run in the code itself. */
const backticksFor = (node: ProseNode, side: -1 | 1): string => {
  const longest = Math.max(
    0,
    ...((node.isText && node.text?.match(/`+/g)) || []).map((r) => r.length)
  )
  const ticks = '`'.repeat(longest + 1)
  if (longest === 0) return ticks
  return side < 0 ? `${ticks} ` : ` ${ticks}`
}

/** Serializations currently inside a link written bare, whose text must not be escaped. */
const inBareLink = new WeakSet<MarkdownSerializerState>()

const serializer = new MarkdownSerializer(
  {
    blockquote: (state, node) => state.wrapBlock('> ', null, node, () => state.renderContent(node)),
    codeBlock: (state, node) => {
      const fence = fenceFor(node.textContent)
      state.write(`${fence}${node.attrs.language ?? ''}\n`)
      state.text(node.textContent, false)
      state.write('\n')
      state.write(fence)
      state.closeBlock(node)
    },
    heading: (state, node) => {
      state.write(`${state.repeat('#', node.attrs.level)} `)
      state.renderInline(node, false)
      state.closeBlock(node)
    },
    horizontalRule: (state, node) => {
      state.write('---')
      state.closeBlock(node)
    },
    bulletList: (state, node) => state.renderList(node, '  ', () => `${node.attrs.bullet ?? '-'} `),
    orderedList: (state, node) => {
      const start: number = node.attrs.start ?? 1
      const width = String(start + node.childCount - 1).length
      state.renderList(node, state.repeat(' ', width + 2), (i) => {
        const number = String(start + i)
        return `${state.repeat(' ', width - number.length)}${number}. `
      })
    },
    listItem: (state, node) => state.renderContent(node),
    paragraph: (state, node) => {
      state.renderInline(node)
      state.closeBlock(node)
    },
    // A plain newline, not CommonMark's `\` break: every reader of this content
    // treats a single newline as a line, and existing blocks are written that way.
    // A heading is one line in markdown, so a break inside one becomes a space.
    hardBreak: (state, node, parent, index) => {
      const hasTextAfter = Array.from({ length: parent.childCount - index - 1 }).some(
        (_, offset) => parent.child(index + 1 + offset).type !== node.type
      )
      if (!hasTextAfter) return
      state.write(parent.type.name === 'heading' ? ' ' : '\n')
    },
    text: (state, node) => state.text(node.text ?? '', !inBareLink.has(state)),
  },
  {
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open: (state: MarkdownSerializerState, mark: Mark, parent: ProseNode, index: number) => {
        if (!isBareLink(mark, parent, index)) return '['
        inBareLink.add(state)
        return ''
      },
      close: (state: MarkdownSerializerState, mark: Mark) => {
        if (inBareLink.delete(state)) return ''
        const title = mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : ''
        return `](${escapeHref(String(mark.attrs.href ?? ''))}${title})`
      },
      mixable: true,
    },
    code: {
      open: (_state: MarkdownSerializerState, _mark: Mark, parent: ProseNode, index: number) =>
        backticksFor(parent.child(index), -1),
      close: (_state: MarkdownSerializerState, _mark: Mark, parent: ProseNode, index: number) =>
        backticksFor(parent.child(index - 1), 1),
      escape: false,
    },
  },
  { hardBreakNodeName: 'hardBreak' }
)

export const parseMarkdown = (markdown: string): ProseNode => parser.parse(markdown)

export const serializeMarkdown = (doc: ProseNode): string =>
  serializer.serialize(doc, { tightLists: true })
