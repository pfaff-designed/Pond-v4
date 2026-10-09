/**
 * Inline content → the text block's markdown marks: bold, italic, strikethrough,
 * code, links and line breaks. Everything else inline keeps its words and loses its
 * tag. Elements that are parts of their own (an image, an embed, a script) are not
 * text: they are handed back, in order, for the block reader to place or list.
 */
import type { Element, ElementContent, Parents } from 'hast'
import { childElements, prop, rawText, resolveUrl } from './hast'

/** Phrasing elements: a run of these (and loose text) is one paragraph. */
export const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'img',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
])

/** Inline elements that are parts of their own, never words in a paragraph. */
const PART_TAGS = new Set([
  'img',
  'picture',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'video',
  'audio',
  'script',
  'noscript',
  'style',
  'link',
  'input',
  'button',
  'select',
  'textarea',
  'form',
  'table',
  'ul',
  'ol',
])

const SILENT_TAGS = new Set(['template', 'meta'])

const MARKS: Record<string, string> = {
  strong: '**',
  b: '**',
  em: '*',
  i: '*',
  del: '~~',
  s: '~~',
  strike: '~~',
}

const CODE_TAGS = new Set(['code', 'kbd', 'samp'])

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export const isCheckbox = (el: Element): boolean =>
  el.tagName === 'input' && (prop(el, 'type') ?? '').toLowerCase() === 'checkbox'

/**
 * The parts of their own inside something read as plain words — a list's items, a
 * table's cells — so an image in a cell is placed, not lost. A list's checkboxes are
 * its state, not parts; nested lists are read into their parent's items.
 */
export const partsWithin = (parent: Parents): Element[] =>
  childElements(parent).flatMap((el) => {
    if (el.tagName === 'ul' || el.tagName === 'ol' || !PART_TAGS.has(el.tagName)) {
      return partsWithin(el)
    }
    return isCheckbox(el) ? [] : [el]
  })

export interface InlineReading {
  markdown: string
  parts: Element[]
}

const escapeText = (text: string): string => text.replace(/[\\`*_[\]~<]/g, (c) => `\\${c}`)

/** A line that would read as a heading, quote or list item keeps its first character literal. */
const escapeLineStart = (line: string): string =>
  line.replace(/^(#{1,6}|[>+-])(?=\s|$)/, '\\$1').replace(/^(\d+)([.)])(?=\s)/, '$1\\$2')

/** Dress a run's words, keeping its outer spaces outside (`** x**` is not bold). */
const dress = (inner: string, around: (core: string) => string): string => {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)
  if (!match || match[2] === '') return inner
  return `${match[1]}${around(match[2])}${match[3]}`
}

const linkTarget = (href: string): string => (/[()\s]/.test(href) ? `<${href}>` : href)

const codeSpan = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ')
  if (collapsed.trim() === '') return collapsed
  const fence = collapsed.includes('`') ? '``' : '`'
  return `${fence}${collapsed}${fence}`
}

/** A link Pond can follow: http(s) or mail, resolved against the file's address. */
export const followableHref = (el: Element, baseUrl: string | undefined): string | undefined => {
  const href = prop(el, 'href')?.trim()
  if (!href || href.startsWith('#')) return undefined
  const url = resolveUrl(href, baseUrl)
  if (!url) return undefined
  return LINK_PROTOCOLS.has(new URL(url).protocol) ? url : undefined
}

export const inlineMarkdown = (
  nodes: readonly ElementContent[],
  baseUrl: string | undefined
): InlineReading => {
  const parts: Element[] = []

  const read = (node: ElementContent): string => {
    if (node.type === 'text') return escapeText(node.value.replace(/\s+/g, ' '))
    if (node.type !== 'element') return ''
    const tag = node.tagName
    if (tag === 'br') return '\n'
    if (SILENT_TAGS.has(tag)) return ''
    if (PART_TAGS.has(tag)) {
      parts.push(node)
      return ''
    }
    if (CODE_TAGS.has(tag)) return codeSpan(rawText(node))
    const inner = node.children.map(read).join('')
    const mark = MARKS[tag]
    if (mark) return dress(inner, (core) => `${mark}${core}${mark}`)
    if (tag !== 'a') return inner
    const href = followableHref(node, baseUrl)
    return href ? dress(inner, (core) => `[${core}](${linkTarget(href)})`) : inner
  }

  const markdown = nodes
    .map(read)
    .join('')
    .split('\n')
    .map((line) => escapeLineStart(line.trim()))
    .join('\n')
    .trim()

  return { markdown, parts }
}
