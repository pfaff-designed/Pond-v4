/**
 * Inline content → the text block's markdown marks: bold, italic, strikethrough,
 * code, links and line breaks. Everything else inline keeps its words and loses its
 * tag. Elements that are parts of their own (an image, an embed, a script) are not
 * text: they are handed back, in order, for the block reader to place or list.
 *
 * The file's words are escaped so that no text reads as markdown: nothing written
 * in the file becomes a mark, a link, an image, html, a heading, a list, a rule or
 * a table when the text block renders it.
 */
import type { Element, ElementContent, Parents } from 'hast'
import { childElements, prop, rawText } from './hast'
import { isPartInline, treatmentOf } from './tags'
import { reachOf, resolveUrl } from './urls'

const MARKS = new Map([
  ['strong', '**'],
  ['b', '**'],
  ['em', '*'],
  ['i', '*'],
  ['del', '~~'],
  ['s', '~~'],
  ['strike', '~~'],
])

const CODE_TAGS = new Set(['code', 'kbd', 'samp'])

export const isCheckbox = (el: Element): boolean =>
  el.tagName === 'input' && (prop(el, 'type') ?? '').toLowerCase() === 'checkbox'

/**
 * The parts of their own inside something read as plain words — a list's items, a
 * table's cells — so an image in a cell is placed, not lost. A list's checkboxes are
 * its state, not parts.
 */
export const partsWithin = (parent: Parents): Element[] =>
  childElements(parent).flatMap((el) => {
    if (!isPartInline(el.tagName)) return partsWithin(el)
    return isCheckbox(el) ? [] : [el]
  })

/** The links inside something read as plain words, short of any part of its own. */
export const linksWithin = (parent: Parents): Element[] =>
  childElements(parent).flatMap((el) => {
    if (el.tagName === 'a') return [el, ...linksWithin(el)]
    return isPartInline(el.tagName) ? [] : linksWithin(el)
  })

export interface InlineReading {
  markdown: string
  parts: Element[]
  /** The links whose address the markdown carries. */
  links: Element[]
}

const MARKDOWN_PUNCTUATION = /[\\`*_[\]~<|]/g
/** `&amp;` written as text would be decoded; a bare `&` is left alone. */
const ENTITY = /&(?=#?[a-z0-9]{1,32};)/gi

/** A `!` ending a run of text would turn a link right after it into an image. */
const escapeText = (text: string): string =>
  text
    .replace(MARKDOWN_PUNCTUATION, (c) => `\\${c}`)
    .replace(ENTITY, '\\&')
    .replace(/!$/, '\\!')

const BLOCK_START = /^(?:#{1,6}|[>+-])(?=\s|$)/
const ORDERED_START = /^(\d{1,9})([.)])(?=\s|$)/
/** A rule (`---`, `- - -`), or the underline that makes the line above a heading. */
const RULE_OR_UNDERLINE = /^(?:=+|-[-\s]*)$/

/** A line that would read as a heading, quote, list item or rule keeps its first character literal. */
const escapeLineStart = (line: string): string => {
  if (RULE_OR_UNDERLINE.test(line)) return `\\${line}`
  return line.replace(BLOCK_START, '\\$&').replace(ORDERED_START, '$1\\$2')
}

/** Plain words as markdown that reads back as exactly those words. */
export const escapeMarkdown = (text: string): string => escapeLineStart(escapeText(text))

/** Dress a run's words, keeping its outer spaces outside (`** x**` is not bold). */
const dress = (inner: string, around: (core: string) => string): string => {
  const core = inner.trim()
  if (core === '') return inner
  const before = inner.slice(0, inner.length - inner.trimStart().length)
  const after = inner.slice(inner.trimEnd().length)
  return `${before}${around(core)}${after}`
}

const linkTarget = (href: string): string => (/[()\s]/.test(href) ? `<${href}>` : href)

/** The longest unbroken run of `char` in `text`, so a fence can be longer. */
export const longestRun = (text: string, char: string): number => {
  let longest = 0
  let run = 0
  for (const c of text) {
    run = c === char ? run + 1 : 0
    if (run > longest) longest = run
  }
  return longest
}

const codeSpan = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ')
  if (collapsed.trim() === '') return collapsed
  const fence = '`'.repeat(longestRun(collapsed, '`') + 1)
  const padded =
    collapsed.startsWith('`') ||
    collapsed.endsWith('`') ||
    (collapsed.startsWith(' ') && collapsed.endsWith(' '))
  const pad = padded ? ' ' : ''
  return `${fence}${pad}${collapsed}${pad}${fence}`
}

/** A link Pond can follow: http(s) or mail, resolved against the file's address. */
export const followableHref = (el: Element, baseUrl: string | undefined): string | undefined => {
  const href = prop(el, 'href')?.trim()
  if (!href || href.startsWith('#')) return undefined
  const url = resolveUrl(href, baseUrl)
  return url && reachOf(url) ? url : undefined
}

export const inlineMarkdown = (
  nodes: readonly ElementContent[],
  baseUrl: string | undefined
): InlineReading => {
  const parts: Element[] = []
  const links: Element[] = []

  const read = (node: ElementContent): string => {
    if (node.type === 'text') return escapeText(node.value.replace(/\s+/g, ' '))
    if (node.type !== 'element') return ''
    const tag = node.tagName
    if (tag === 'br') return '\n'
    const treatment = treatmentOf(tag)
    if (treatment === 'metadata' || treatment === 'hidden') return ''
    if (isPartInline(tag)) {
      parts.push(node)
      return ''
    }
    if (CODE_TAGS.has(tag)) return codeSpan(rawText(node))
    const inner = node.children.map(read).join('')
    const mark = MARKS.get(tag)
    if (mark) return dress(inner, (core) => `${mark}${core}${mark}`)
    if (tag !== 'a') return inner
    const href = followableHref(node, baseUrl)
    if (!href || inner.trim() === '') return inner
    links.push(node)
    return dress(inner, (core) => `[${core}](${linkTarget(href)})`)
  }

  const markdown = nodes
    .map(read)
    .join('')
    .split('\n')
    .map((line) => escapeLineStart(line.trim()))
    .join('\n')
    .trim()

  return { markdown, parts, links }
}
