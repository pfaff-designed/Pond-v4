/**
 * Small readers over the parsed tree. hast keeps attributes as typed `properties`
 * under their DOM names (`data-table` → `dataTable`, `aria-describedby` →
 * `ariaDescribedBy`, `datetime` → `dateTime`), so these take the property name.
 */
import type { Element, ElementContent, Nodes, Parents, Root } from 'hast'

export const childElements = (parent: Parents): Element[] => {
  const elements: Element[] = []
  for (const child of parent.children) if (child.type === 'element') elements.push(child)
  return elements
}

/** An attribute as a string — token lists joined by spaces, a bare boolean as `''`. */
export const prop = (el: Element, name: string): string | undefined => {
  const value = el.properties[name]
  if (value === undefined || value === null || value === false) return undefined
  if (value === true) return ''
  if (Array.isArray(value)) return value.join(' ')
  return String(value)
}

/** Every element under `parent`, depth first, in document order. */
export const descendants = (parent: Parents): Element[] =>
  childElements(parent).flatMap((el) => [el, ...descendants(el)])

export const findFirst = (parent: Parents, test: (el: Element) => boolean): Element | undefined => {
  for (const el of childElements(parent)) {
    if (test(el)) return el
    const found = findFirst(el, test)
    if (found) return found
  }
  return undefined
}

/** The closest element `el` sits inside that passes `test`. */
export const ancestor = (
  el: Element,
  parents: Map<Element, Element>,
  test: (candidate: Element) => boolean
): Element | undefined => {
  for (let up = parents.get(el); up; up = parents.get(up)) if (test(up)) return up
  return undefined
}

/** Text exactly as written, whitespace kept — for preformatted text. */
export const rawText = (node: ElementContent): string => {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(rawText).join('')
  return ''
}

/** Elements by id, for the attributes that point at another part of the file. */
export const indexIds = (root: Root): Map<string, Element> => {
  const byId = new Map<string, Element>()
  for (const el of descendants(root)) {
    const id = prop(el, 'id')
    if (id && !byId.has(id)) byId.set(id, el)
  }
  return byId
}

/** Child → parent, so a part can ask what it sits inside. */
export const indexParents = (root: Root): Map<Element, Element> => {
  const parents = new Map<Element, Element>()
  for (const el of descendants(root)) {
    for (const child of childElements(el)) parents.set(child, el)
  }
  return parents
}

const NO_TEXT = new Set(['script', 'style', 'template', 'noscript'])

/** The text a reader sees, whitespace collapsed. */
export const plainText = (node: Nodes): string => {
  const collect = (n: Nodes): string => {
    if (n.type === 'text') return n.value
    if (n.type === 'element' && n.tagName === 'br') return ' '
    if (n.type === 'element' && NO_TEXT.has(n.tagName)) return ''
    if (n.type !== 'element' && n.type !== 'root') return ''
    let text = ''
    for (const child of n.children) text += collect(child)
    return text
  }
  return collect(node).replace(/\s+/g, ' ').trim()
}

/** The last path segment of a link, decoded — the file's name. */
export const fileNameOf = (url: string): string | undefined => {
  const path = url.split(/[?#]/)[0]
  const last = path.split('/').pop()
  if (!last) return undefined
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/** A link resolved against the file's own address; `undefined` when it can't be. */
export const resolveUrl = (href: string, baseUrl: string | undefined): string | undefined => {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return undefined
  }
}
