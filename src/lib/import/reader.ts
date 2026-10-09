/**
 * The walk over a parsed file: every element is placed as a block, read into a
 * database, or named in what was left out. Nothing is skipped without one of those,
 * except the document's own metadata (`meta`, icons, `base`) and `template`, which
 * a browser never shows.
 */
import type { Element, ElementContent, Parents, Root } from 'hast'
import {
  createReader,
  insideOf,
  leaveOut,
  place,
  takeCaption,
  withinOf,
  type Figure,
  type ReadDocumentOptions,
  type Reader,
} from './context'
import { picture, settle, table } from './data-parts'
import { ancestor, childElements, descendants, findFirst, plainText, prop } from './hast'
import { INLINE_TAGS, inlineMarkdown, partsWithin, type InlineReading } from './inline'
import { fileLink, imageBlock, imageSource } from './media'
import {
  codeMarkdown,
  definitionsMarkdown,
  headingMarkdown,
  LIST_TAGS,
  listItems,
  quoteMarkdown,
  sameWords,
  type ListItemReading,
} from './text-blocks'
import type { HtmlReading } from './types'

/** Where a page's own content lives; a header or footer inside one belongs to the page. */
const CONTENT_TAGS = new Set(['main', 'article', 'section', 'aside', 'figure', 'blockquote'])
const SITE_ROLES = new Set(['navigation', 'banner', 'contentinfo'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const SILENT = new Set(['title', 'meta', 'base', 'template'])
const EMBEDS = new Set(['iframe', 'object', 'embed', 'applet', 'frame', 'frameset'])
const CONTROLS = new Set(['button', 'input', 'select', 'textarea'])
const STYLE_RELS = new Set(['stylesheet', 'preconnect', 'dns-prefetch', 'preload', 'prefetch'])

const MAP_WORDS = /(^|[^a-z])maps?([^a-z]|$)|openstreetmap|mapbox|leaflet/
const VIDEO_WORDS = /youtube|youtu\.be|vimeo|(^|[^a-z])video([^a-z]|$)|\.(mp4|webm|mov)([^a-z]|$)/

/** Inline styles and the code a file hides in attributes: handlers and `javascript:` links. */
const scanAttributes = (root: Root, r: Reader) => {
  for (const el of descendants(root)) {
    if (prop(el, 'style') !== undefined || el.tagName === 'font') {
      leaveOut('styling', el, 'styling', r)
    }
    const handlers = Object.keys(el.properties).some((name) => /^on[A-Z]/.test(name))
    const scriptLink = /^\s*javascript:/i.test(prop(el, 'href') ?? '')
    if (handlers || scriptLink) leaveOut('scripts', el, 'script', r)
  }
}

/** A container's children: runs of inline content become paragraphs, the rest are parts. */
const walk = (parent: Parents, r: Reader) => {
  const within = parent.type === 'element' ? insideOf(parent, r) : []
  let run: ElementContent[] = []
  const flush = () => {
    if (run.length > 0) paragraph(run, within, r)
    run = []
  }
  for (const child of parent.children) {
    if (child.type === 'text') run.push(child)
    else if (child.type === 'element' && INLINE_TAGS.has(child.tagName)) run.push(child)
    else if (child.type === 'element') {
      flush()
      block(child, r)
    }
  }
  flush()
}

const textBlock = (reading: InlineReading, within: string[], kind: string, r: Reader) => {
  if (reading.markdown !== '') {
    place({ id: r.mintId(), type: 'text', content: reading.markdown }, within, kind, r)
    if (kind !== 'heading') r.found.text += 1
  }
  for (const part of reading.parts) block(part, r)
}

/** A paragraph, or a file block when it is nothing but a link to a file. */
const paragraph = (nodes: readonly ElementContent[], within: string[], r: Reader) => {
  const significant = nodes.filter((node) => !(node.type === 'text' && node.value.trim() === ''))
  const lone =
    significant.length === 1 && significant[0].type === 'element' ? significant[0] : undefined
  const file = lone?.tagName === 'a' ? fileLink(lone, r.baseUrl) : undefined
  if (lone && file) {
    place(imageBlock(r.mintId(), file, plainText(lone) || undefined), within, 'file', r)
    return
  }
  textBlock(inlineMarkdown(nodes, r.baseUrl), within, 'paragraph', r)
}

const isSiteChrome = (el: Element, r: Reader): boolean =>
  el.tagName === 'nav' ||
  SITE_ROLES.has(prop(el, 'role') ?? '') ||
  ((el.tagName === 'header' || el.tagName === 'footer') &&
    !ancestor(el, r.parents, (up) => CONTENT_TAGS.has(up.tagName)))

const block = (el: Element, r: Reader): void => {
  const tag = el.tagName
  const within = withinOf(el, r)
  if (SILENT.has(tag)) return
  if (tag === 'script' || tag === 'noscript') return leaveOut('scripts', el, 'script', r)
  if (tag === 'style' || tag === 'hr') return leaveOut('styling', el, 'styling', r)
  if (tag === 'link') return link(el, r)
  if (isSiteChrome(el, r)) return leaveOut('siteLinks', el, tag, r)
  if (tag === 'form') return leaveOut('form', el, 'form', r)
  if (CONTROLS.has(tag)) return leaveOut('controls', el, 'buttons', r)
  if (EMBEDS.has(tag)) return embed(el, r)
  if (tag === 'video') return leaveOut('video', el, 'video', r)
  if (tag === 'audio') return leaveOut('audio', el, 'audio', r)
  if (tag === 'svg' || tag === 'canvas') return picture(el, r)
  if (HEADINGS.has(tag)) return heading(el, r)
  if (tag === 'p') return paragraph(el.children, within, r)
  if (LIST_TAGS.has(tag)) return list(el, r)
  if (tag === 'blockquote') return textBlock(quoteMarkdown(el, r.baseUrl), within, 'quote', r)
  if (tag === 'dl') return textBlock(definitionsMarkdown(el, r.baseUrl), within, 'definitions', r)
  if (tag === 'pre') return textBlock({ markdown: codeMarkdown(el), parts: [] }, within, 'code', r)
  if (tag === 'table') return tableWithParts(el, r)
  if (tag === 'figure') return figure(el, r)
  if (tag === 'img' || tag === 'picture') return image(el, r)
  if (tag === 'figcaption' && r.figure?.captionEl === el) return
  walk(el, r)
}

const tableWithParts = (el: Element, r: Reader) => {
  table(el, r)
  for (const part of partsWithin(el)) block(part, r)
}

const link = (el: Element, r: Reader) => {
  const rels = (prop(el, 'rel') ?? '').toLowerCase().split(/\s+/)
  if (rels.includes('modulepreload') || prop(el, 'as') === 'script') {
    return leaveOut('scripts', el, 'script', r)
  }
  if (rels.some((rel) => STYLE_RELS.has(rel))) leaveOut('styling', el, 'styling', r)
}

/** An embedded app, named by what it shows. */
const embed = (el: Element, r: Reader) => {
  const words = ['src', 'data', 'title', 'ariaLabel']
    .map((name) => prop(el, name) ?? '')
    .join(' ')
    .toLowerCase()
  if (MAP_WORDS.test(words)) return leaveOut('map', el, 'map', r)
  if (VIDEO_WORDS.test(words)) return leaveOut('video', el, 'video', r)
  leaveOut('app', el, 'embedded app', r)
}

const heading = (el: Element, r: Reader) => {
  const words = plainText(el)
  r.found.headings += 1
  r.lastHeading = words || r.lastHeading
  if (r.titlePending && el.tagName === 'h1' && sameWords(words, r.title)) {
    r.titlePending = false
    return
  }
  textBlock(headingMarkdown(el, r.baseUrl), withinOf(el, r), 'heading', r)
}

const list = (el: Element, r: Reader) => {
  const items = listItems(el)
  if (items.length > 0) listBlock(el, items, r)
  for (const part of partsWithin(el)) block(part, r)
}

const listBlock = (el: Element, items: ListItemReading[], r: Reader) => {
  const id = r.mintId()
  const checklist = items.every((item) => item.checked !== null)
  const todo = items.map((item) => ({
    id: r.mintId(),
    label: item.label,
    checked: item.checked === true,
  }))
  place(
    { id, type: 'todo', marker: checklist ? 'check' : 'dot', items: todo },
    withinOf(el, r),
    'list',
    r
  )
  r.found.text += 1
}

const image = (el: Element, r: Reader) => {
  const img = el.tagName === 'img' ? el : findFirst(el, (child) => child.tagName === 'img')
  const source = img ? imageSource(img, r.baseUrl) : undefined
  if (!img || !source) return
  r.found.images += 1
  if (source === 'beside') return leaveOut('imageBeside', img, 'image', r)
  const caption = takeCaption(r) ?? (prop(img, 'alt')?.trim() || undefined)
  place(imageBlock(r.mintId(), source.url, caption), withinOf(el, r), 'image', r)
  if (source.linked && !r.linkedImages.includes(source.url)) r.linkedImages.push(source.url)
}

/** A figure's caption goes to the part it captions, else it is a paragraph of its own. */
const figure = (el: Element, r: Reader) => {
  const captionEl = childElements(el).find((child) => child.tagName === 'figcaption')
  const outer = r.figure
  const current: Figure = { caption: captionEl ? plainText(captionEl) : '', captionEl, used: false }
  r.figure = current
  walk(el, r)
  r.figure = outer
  if (captionEl && !current.used) paragraph(captionEl.children, withinOf(captionEl, r), r)
}

export const readDocument = (root: Root, opts: ReadDocumentOptions): HtmlReading => {
  const r = createReader(root, opts)
  scanAttributes(root, r)
  walk(root, r)
  const { blocks, provenance } = settle(r)
  const records = [...r.databaseTickets].map(([database, ticket]) => ({
    ...database,
    from: r.paths.resolve(ticket),
  }))
  return {
    title: r.title,
    blocks,
    records,
    tables: r.tables,
    leftOut: r.leftOut.list(),
    found: r.found,
    provenance,
    linkedImages: r.linkedImages,
  }
}
