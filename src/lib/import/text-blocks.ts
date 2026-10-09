/**
 * The parts of a file that become text blocks or lists, read into the markdown the
 * text block stores and the items a list holds. Pure: ids and placement are the
 * reader's.
 */
import type { Element, ElementContent } from 'hast'
import { childElements, plainText, prop, rawText } from './hast'
import { INLINE_TAGS, inlineMarkdown, isCheckbox, type InlineReading } from './inline'

/** The text block draws three heading levels; deeper headings sit at the third. */
const DEEPEST_HEADING = 3

export const LIST_TAGS = new Set(['ul', 'ol', 'menu'])

const headingLevel = (el: Element): number => Math.min(Number(el.tagName.slice(1)), DEEPEST_HEADING)

export const headingMarkdown = (el: Element, baseUrl: string | undefined): InlineReading => {
  const { markdown, parts } = inlineMarkdown(el.children, baseUrl)
  const words = markdown.replace(/\n/g, ' ').replace(/^\\(?=[#>+-])/, '')
  return { markdown: words === '' ? '' : `${'#'.repeat(headingLevel(el))} ${words}`, parts }
}

export interface ListItemReading {
  label: string
  /** The item's checkbox state, or null when it has none. */
  checked: boolean | null
}

/** The item's own checkbox, not one in a list nested under it. */
const checkboxIn = (nodes: readonly ElementContent[]): Element | undefined => {
  for (const node of nodes) {
    if (node.type !== 'element' || LIST_TAGS.has(node.tagName)) continue
    if (isCheckbox(node)) return node
    const found = checkboxIn(node.children)
    if (found) return found
  }
  return undefined
}

/** Every item, a nested list's items following their parent's, in reading order. */
export const listItems = (list: Element): ListItemReading[] =>
  childElements(list)
    .filter((el) => el.tagName === 'li')
    .flatMap((li) => {
      const own = li.children.filter(
        (node) => !(node.type === 'element' && LIST_TAGS.has(node.tagName))
      )
      const label = plainText({ type: 'element', tagName: 'span', properties: {}, children: own })
      const box = checkboxIn(own)
      const nested = childElements(li)
        .filter((el) => LIST_TAGS.has(el.tagName))
        .flatMap(listItems)
      const item: ListItemReading[] = label
        ? [{ label, checked: box ? prop(box, 'checked') !== undefined : null }]
        : []
      return [...item, ...nested]
    })

/** Split a container's children into paragraphs: runs of inline content, and block children. */
const paragraphsOf = (
  el: Element,
  baseUrl: string | undefined
): { paragraphs: string[]; parts: Element[] } => {
  const paragraphs: string[] = []
  const parts: Element[] = []
  let run: ElementContent[] = []
  const take = (nodes: readonly ElementContent[], prefix = '') => {
    const reading = inlineMarkdown(nodes, baseUrl)
    if (reading.markdown !== '') paragraphs.push(`${prefix}${reading.markdown}`)
    parts.push(...reading.parts)
  }
  const flush = () => {
    take(run)
    run = []
  }
  for (const child of el.children) {
    if (child.type === 'element' && !INLINE_TAGS.has(child.tagName)) {
      flush()
      take(child.children, child.tagName === 'footer' ? '— ' : '')
    } else if (child.type === 'text' || child.type === 'element') run.push(child)
  }
  flush()
  return { paragraphs, parts }
}

/** A quote, as markdown quote lines (until the registry has a quote block of its own). */
export const quoteMarkdown = (el: Element, baseUrl: string | undefined): InlineReading => {
  const { paragraphs, parts } = paragraphsOf(el, baseUrl)
  const quoted = paragraphs.map((paragraph) =>
    paragraph
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  )
  return { markdown: quoted.join('\n>\n'), parts }
}

const LANGUAGE = /(?:^|\s)lang(?:uage)?-([\w+-]+)/

/** Preformatted text as a fenced code block, its language kept when the file names one. */
export const codeMarkdown = (pre: Element): string => {
  const text = rawText(pre).replace(/^\n/, '').replace(/\s+$/, '')
  if (text.trim() === '') return ''
  const code = childElements(pre).find((el) => el.tagName === 'code')
  const language = LANGUAGE.exec(
    `${prop(pre, 'className') ?? ''} ${code ? (prop(code, 'className') ?? '') : ''}`
  )
  const fence = text.includes('```') ? '~~~' : '```'
  return `${fence}${language?.[1] ?? ''}\n${text}\n${fence}`
}

/** A definition list: each term in bold on its own line, its definitions under it. */
export const definitionsMarkdown = (dl: Element, baseUrl: string | undefined): InlineReading => {
  const parts: Element[] = []
  const entries = childElements(dl).flatMap((el) =>
    el.tagName === 'div' ? childElements(el) : [el]
  )
  const lines = entries.flatMap((el) => {
    if (el.tagName !== 'dt' && el.tagName !== 'dd') return []
    const reading = inlineMarkdown(el.children, baseUrl)
    parts.push(...reading.parts)
    if (reading.markdown === '') return []
    return [el.tagName === 'dt' ? `**${reading.markdown}**` : reading.markdown]
  })
  return { markdown: lines.join('\n'), parts }
}

/** Whether two bits of text say the same words, ignoring case and spacing. */
export const sameWords = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()
