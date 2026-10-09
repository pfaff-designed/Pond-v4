import MarkdownIt, { type Token } from 'markdown-it'
import {
  MarkdownParser,
  MarkdownSerializer,
  type MarkdownSerializerState,
} from 'prosemirror-markdown'
import type { Mark, Node as ProseNode } from '@tiptap/pm/model'
import { numberAttr, proseSchema, stringAttr } from './document'

/**
 * The text block's markdown `content` ⇄ its document. This parse is the only
 * reading of a text block: the page, the editor and the diff card all draw it.
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
  if (stringAttr(mark.attrs, 'title') || !child.isText) return false
  const text = child.text ?? ''
  const href = stringAttr(mark.attrs, 'href') ?? ''
  const sameAddress = [text, `http://${text}`, `https://${text}`, `mailto:${text}`].includes(href)
  const endsHere = index === parent.childCount - 1 || !mark.isInSet(parent.child(index + 1).marks)
  return sameAddress && endsHere && child.marks[child.marks.length - 1] === mark
}

/**
 * A link's address as markdown: bare where it can be, else in `<…>`, the only form
 * that holds a space or a `<`. Neither holds a line break, so that is written as
 * the `%0A` the parser would have made of it anyway.
 */
const linkDestination = (href: string): string => {
  const unbroken = href.replace(/[\r\n]/g, encodeURIComponent)
  if (!/[\s<>\x00-\x1f\x7f]/.test(unbroken)) return unbroken.replace(/[\\()]/g, '\\$&')
  return `<${unbroken.replace(/[\\<>]/g, '\\$&')}>`
}

/** A link title in quotes, its backslashes escaped too, so a last one can't escape the closing quote. */
const linkTitle = (title: string): string => ` "${title.replace(/[\\"]/g, '\\$&')}"`

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/
/** Unknown neighbours (the edge of this text) count as not-space: escape to be safe. */
const isSpace = (char: string | undefined): boolean => char !== undefined && /\s/.test(char)
const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char)

/** The characters either side of the run of `text[index]` that `index` sits in. */
const runAround = (text: string, index: number): [string | undefined, string | undefined] => {
  let start = index
  let end = index
  while (text[start - 1] === text[index]) start -= 1
  while (text[end + 1] === text[index]) end += 1
  return [text[start - 1], text[end + 1]]
}

/** Would the parser read `text[index]` as markup, wherever on the line it is? */
const isInlineMarkup = (text: string, index: number): boolean => {
  const rest = text.slice(index)
  switch (text[index]) {
    case '\\':
      return index === text.length - 1 || ASCII_PUNCTUATION.test(text[index + 1])
    case '`':
      return true
    case '~':
      return text[index - 1] === '~' || text[index + 1] === '~'
    case '*': {
      const [before, after] = runAround(text, index)
      return !(isSpace(before) && isSpace(after))
    }
    case '_': {
      const [before, after] = runAround(text, index)
      return !(isSpace(before) && isSpace(after)) && !(isWordChar(before) && isWordChar(after))
    }
    case ']':
      return text[index + 1] === '('
    case '&':
      return /^&(#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{1,31});/i.test(rest)
    case '<':
      return /^<([a-z][a-z\d+.-]{1,31}:[^\s<>]*|[^\s@<>]+@[^\s@<>]+)>/i.test(rest)
    default:
      return false
  }
}

/**
 * Where a line's own markup would start, if the text opening it were read as
 * markdown: a quote, heading, list item, rule or link definition at the start of
 * a block; after a line break also a setext underline (a list or reference can't
 * interrupt a paragraph, except a list numbered 1).
 */
const lineMarkupAt = (text: string, after: 'block' | 'break'): number => {
  const lead = /^ {0,3}/.exec(text)?.[0].length ?? 0
  const line = text.slice(lead)
  const ordered = /^(\d{1,9})[.)](\s|$)/.exec(line)
  if (/^(>|#{1,6}(\s|$)|[-+*](\s|$))/.test(line)) return lead
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return lead
  if (after === 'break' && /^(=+|-+)[ \t]*$/.test(line)) return lead
  if (ordered && (after === 'block' || ordered[1] === '1')) return lead + ordered[1].length
  if (after === 'block') {
    const definition = /^\[[^\]]+\]:/.exec(line)
    if (definition) return lead + definition[0].length - 2
  }
  return -1
}

/**
 * Escapes only what the parser would otherwise read as markup, so text is written
 * as typed: a task marker, a pipe, a lone `~` or `*` keeps its spelling for any
 * reader that draws it.
 */
const escapeText = (text: string, lineStart: 'block' | 'break' | null): string => {
  const lineMarkup = lineStart ? lineMarkupAt(text, lineStart) : -1
  let escaped = ''
  for (let index = 0; index < text.length; index += 1) {
    const markup = index === lineMarkup || isInlineMarkup(text, index)
    escaped += markup ? `\\${text[index]}` : text[index]
  }
  return escaped
}

const lineStartOf = (parent: ProseNode, index: number): 'block' | 'break' | null => {
  if (parent.type.name === 'heading') return null
  if (index === 0) return 'block'
  return parent.child(index - 1).type.name === 'hardBreak' ? 'break' : null
}

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
      state.write(`${fence}${stringAttr(node.attrs, 'language') ?? ''}\n`)
      state.text(node.textContent, false)
      state.write('\n')
      state.write(fence)
      state.closeBlock(node)
    },
    heading: (state, node) => {
      state.write(`${state.repeat('#', numberAttr(node.attrs, 'level') ?? 1)} `)
      state.renderInline(node, false)
      state.closeBlock(node)
    },
    horizontalRule: (state, node) => {
      state.write('---')
      state.closeBlock(node)
    },
    bulletList: (state, node) =>
      state.renderList(node, '  ', () => `${stringAttr(node.attrs, 'bullet') ?? '-'} `),
    orderedList: (state, node) => {
      const start = numberAttr(node.attrs, 'start') ?? 1
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
    // A plain newline, not CommonMark's `\` break: the parser reads a single
    // newline as a line, and existing blocks are written that way. A heading is one
    // line in markdown, so a break inside one becomes a space.
    hardBreak: (state, node, parent, index) => {
      const hasTextAfter = Array.from({ length: parent.childCount - index - 1 }).some(
        (_, offset) => parent.child(index + 1 + offset).type !== node.type
      )
      if (!hasTextAfter) return
      state.write(parent.type.name === 'heading' ? ' ' : '\n')
    },
    text: (state, node, parent, index) => {
      const text = node.text ?? ''
      state.text(inBareLink.has(state) ? text : escapeText(text, lineStartOf(parent, index)), false)
    },
  },
  {
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    link: {
      // Written directly rather than returned: a returned `[` makes the serializer
      // escape a `!` before it, turning `![alt](src)` into different text.
      open: (state: MarkdownSerializerState, mark: Mark, parent: ProseNode, index: number) => {
        if (isBareLink(mark, parent, index)) inBareLink.add(state)
        else state.write('[')
        return ''
      },
      close: (state: MarkdownSerializerState, mark: Mark) => {
        if (inBareLink.delete(state)) return ''
        const title = stringAttr(mark.attrs, 'title')
        const href = linkDestination(stringAttr(mark.attrs, 'href') ?? '')
        return `](${href}${title ? linkTitle(title) : ''})`
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
