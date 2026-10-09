/**
 * Small readers over the parsed tree. hast keeps attributes as typed `properties`
 * under their DOM names (`data-table` → `dataTable`, `aria-describedby` →
 * `ariaDescribedBy`, `datetime` → `dateTime`), so these take the property name.
 */
import type { Element, ElementContent, Nodes, Parents } from 'hast'
import { hasNoText } from './tags'

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

/** Every element under `parent`, in document order, however deep the file nests. */
export const descendants = (parent: Parents): Element[] => {
  const elements: Element[] = []
  const stack = childElements(parent).reverse()
  for (let el = stack.pop(); el; el = stack.pop()) {
    elements.push(el)
    for (let i = el.children.length - 1; i >= 0; i--) {
      const child = el.children[i]
      if (child.type === 'element') stack.push(child)
    }
  }
  return elements
}

export const findFirst = (parent: Parents, test: (el: Element) => boolean): Element | undefined => {
  for (const el of childElements(parent)) {
    if (test(el)) return el
    const found = findFirst(el, test)
    if (found) return found
  }
  return undefined
}

/**
 * For every element, the closest element it sits inside that passes `test`. One
 * pass in document order, where a parent always comes before its children.
 */
export const closestAncestors = (
  elements: readonly Element[],
  parents: Map<Element, Element>,
  test: (candidate: Element) => boolean
): Map<Element, Element> => {
  const closest = new Map<Element, Element>()
  for (const el of elements) {
    const parent = parents.get(el)
    const found = parent && (test(parent) ? parent : closest.get(parent))
    if (found) closest.set(el, found)
  }
  return closest
}

/** Text exactly as written, whitespace kept — for preformatted text. */
export const rawText = (node: ElementContent): string => {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(rawText).join('')
  return ''
}

/** Elements by id, for the attributes that point at another part of the file. */
export const indexIds = (elements: readonly Element[]): Map<string, Element> => {
  const byId = new Map<string, Element>()
  for (const el of elements) {
    const id = prop(el, 'id')
    if (id && !byId.has(id)) byId.set(id, el)
  }
  return byId
}

/** Child → parent, so a part can ask what it sits inside. */
export const indexParents = (elements: readonly Element[]): Map<Element, Element> => {
  const parents = new Map<Element, Element>()
  for (const el of elements) {
    for (const child of childElements(el)) parents.set(child, el)
  }
  return parents
}

/** The text a reader sees, whitespace collapsed. */
export const plainText = (node: Nodes): string => {
  const collect = (n: Nodes): string => {
    if (n.type === 'text') return n.value
    if (n.type === 'element' && n.tagName === 'br') return ' '
    if (n.type === 'element' && hasNoText(n.tagName)) return ''
    if (n.type !== 'element' && n.type !== 'root') return ''
    let text = ''
    for (const child of n.children) text += collect(child)
    return text
  }
  return collect(node).replace(/\s+/g, ' ').trim()
}
