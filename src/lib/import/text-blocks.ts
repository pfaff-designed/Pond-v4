/**
 * The parts of a file that become text blocks or lists, read into the markdown the
 * text block stores and the items a list holds. Pure: ids and placement are the
 * reader's.
 */
import type { Element, ElementContent } from 'hast'
import { childElements, plainText, prop, rawText } from './hast'
import { inlineMarkdown, isCheckbox, longestRun, type InlineReading } from './inline'
import { runsInline, treatmentOf } from './tags'

/** The text block draws three heading levels; deeper headings sit at the third. */
const DEEPEST_HEADING = 3

const isList = (node: ElementContent): boolean =>
  node.type === 'element' && treatmentOf(node.tagName) === 'list'

const headingLevel = (el: Element): number => Math.min(Number(el.tagName.slice(1)), DEEPEST_HEADING)

export const headingMarkdown = (el: Element, baseUrl: string | undefined): InlineReading => {
  const reading = inlineMarkdown(el.children, baseUrl)
  const words = reading.markdown.replace(/\n/g, ' ').replace(/^\\(?=[#>+=-])/, '')
  return { ...reading, markdown: words === '' ? '' : `${'#'.repeat(headingLevel(el))} ${words}` }
}

export interface ListItemReading {
  label: string
  /** The item's checkbox state, or null when it has none. */
  checked: boolean | null
}

/** The item's own checkbox, not one in a list nested under it. */
const checkboxIn = (nodes: readonly ElementContent[]): Element | undefined => {
  for (const node of nodes) {
    if (node.type !== 'element' || isList(node)) continue
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
      const own = li.children.filter((node) => !isList(node))
      const label = plainText({ type: 'element', tagName: 'span', properties: {}, children: own })
      const box = checkboxIn(own)
      const nested = childElements(li).filter(isList).flatMap(listItems)
      const item: ListItemReading[] = label
        ? [{ label, checked: box ? prop(box, 'checked') !== undefined : null }]
        : []
      return [...item, ...nested]
    })

/** Split a container's children into paragraphs: runs of inline content, and block children. */
const paragraphsOf = (
  el: Element,
  baseUrl: string | undefined
): { paragraphs: string[]; parts: Element[]; links: Element[] } => {
  const paragraphs: string[] = []
  const parts: Element[] = []
  const links: Element[] = []
  let run: ElementContent[] = []
  const take = (nodes: readonly ElementContent[], prefix = '') => {
    const reading = inlineMarkdown(nodes, baseUrl)
    if (reading.markdown !== '') paragraphs.push(`${prefix}${reading.markdown}`)
    parts.push(...reading.parts)
    links.push(...reading.links)
  }
  const flush = () => {
    take(run)
    run = []
  }
  for (const child of el.children) {
    if (child.type === 'element' && !runsInline(child.tagName)) {
      flush()
      take(child.children, child.tagName === 'footer' ? '— ' : '')
    } else if (child.type === 'text' || child.type === 'element') run.push(child)
  }
  flush()
  return { paragraphs, parts, links }
}

/** A quote, as markdown quote lines. */
export const quoteMarkdown = (el: Element, baseUrl: string | undefined): InlineReading => {
  const { paragraphs, parts, links } = paragraphsOf(el, baseUrl)
  const quoted = paragraphs.map((paragraph) =>
    paragraph
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  )
  return { markdown: quoted.join('\n>\n'), parts, links }
}

const LANGUAGE = /(?:^|\s)lang(?:uage)?-([\w+-]+)/

/** Preformatted text as a fenced code block, its language kept when the file names one. */
export const codeMarkdown = (pre: Element): string => {
  const text = rawText(pre).replace(/^\n/, '').trimEnd()
  if (text.trim() === '') return ''
  const code = childElements(pre).find((el) => el.tagName === 'code')
  const language = LANGUAGE.exec(
    `${prop(pre, 'className') ?? ''} ${code ? (prop(code, 'className') ?? '') : ''}`
  )
  const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1))
  return `${fence}${language?.[1] ?? ''}\n${text}\n${fence}`
}

/** A definition list: each term in bold on its own line, its definitions under it. */
export const definitionsMarkdown = (dl: Element, baseUrl: string | undefined): InlineReading => {
  const parts: Element[] = []
  const links: Element[] = []
  const entries = childElements(dl).flatMap((el) =>
    el.tagName === 'div' ? childElements(el) : [el]
  )
  const lines = entries.flatMap((el) => {
    if (el.tagName !== 'dt' && el.tagName !== 'dd') return []
    const reading = inlineMarkdown(el.children, baseUrl)
    parts.push(...reading.parts)
    links.push(...reading.links)
    if (reading.markdown === '') return []
    return [el.tagName === 'dt' ? `**${reading.markdown}**` : reading.markdown]
  })
  return { markdown: lines.join('\n'), parts, links }
}

/** Whether two bits of text say the same words, ignoring case and spacing. */
export const sameWords = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()
