/**
 * The walk over a parsed file: every element is placed as a block, read into a
 * database, or named in what was left out. Nothing is skipped without one of those,
 * except the document's own metadata (`meta`, icons, `base`) and `template`, which
 * a browser never shows. A link whose address no block carries is listed too.
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
  type PartKind,
  type ReadDocumentOptions,
  type Reader,
} from './context'
import { childElements, findFirst, plainText, prop } from './hast'
import { inlineMarkdown, partsWithin, type InlineReading } from './inline'
import { embed, listUncarriedLinks, resource, scanAttributes, siteChrome } from './listed-parts'
import { fileLink, imageBlock, imageSource } from './media'
import { picture, placeFileLinks, settle, table } from './table-and-chart-blocks'
import { runsInline, treatmentOf } from './tags'
import {
  codeMarkdown,
  definitionsMarkdown,
  headingMarkdown,
  listItems,
  quoteMarkdown,
  sameWords,
} from './text-blocks'
import type { HtmlReading } from './types'

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
    else if (child.type === 'element' && runsInline(child.tagName)) run.push(child)
    else if (child.type === 'element') {
      flush()
      block(child, r)
    }
  }
  flush()
}

const textBlock = (reading: InlineReading, within: string[], kind: PartKind, r: Reader) => {
  if (reading.markdown !== '') {
    place({ id: r.mintId(), type: 'text', content: reading.markdown }, within, kind, r)
    for (const a of reading.links) r.carried.add(a)
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
    r.carried.add(lone)
    return
  }
  textBlock(inlineMarkdown(nodes, r.baseUrl), within, 'paragraph', r)
}

const block = (el: Element, r: Reader): void => {
  const treatment = treatmentOf(el.tagName)
  if (treatment === 'metadata') return
  if (treatment === 'hidden') return void r.accounted.add(el)
  if (treatment === 'script') return leaveOut('scripts', el, 'script', r)
  if (treatment === 'styling') return leaveOut('styling', el, 'styling', r)
  if (treatment === 'resource') return resource(el, r)
  const chrome = siteChrome(el, r)
  if (chrome) return leaveOut('siteLinks', el, chrome, r)
  const within = withinOf(el, r)
  switch (treatment) {
    case 'form':
      return leaveOut('form', el, 'form', r)
    case 'control':
      return leaveOut('controls', el, 'buttons', r)
    case 'embed':
      return embed(el, r)
    case 'video':
      return leaveOut('video', el, 'video', r)
    case 'audio':
      return leaveOut('audio', el, 'audio', r)
    case 'drawing':
      return picture(el, r)
    case 'heading':
      return heading(el, r)
    case 'paragraph':
      return paragraph(el.children, within, r)
    case 'list':
      return list(el, r)
    case 'quote':
      return textBlock(quoteMarkdown(el, r.baseUrl), within, 'quote', r)
    case 'definitions':
      return textBlock(definitionsMarkdown(el, r.baseUrl), within, 'definitions', r)
    case 'code':
      return textBlock({ markdown: codeMarkdown(el), parts: [], links: [] }, within, 'code', r)
    case 'table':
      return tableWithParts(el, r)
    case 'figure':
      return figure(el, r)
    case 'image':
      return image(el, r)
    case 'caption':
      return r.figure?.captionEl === el ? undefined : walk(el, r)
    default:
      return walk(el, r)
  }
}

/** A table, then the parts inside its cells. */
const tableWithParts = (el: Element, r: Reader) => {
  table(el, r)
  for (const part of partsWithin(el)) block(part, r)
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

/** A list, then the files its items link to, then the parts inside its items. */
const list = (el: Element, r: Reader) => {
  const items = listItems(el)
  if (items.length > 0) {
    const id = r.mintId()
    const marker = items.every((item) => item.checked !== null) ? 'check' : 'dot'
    const todo = items.map((item) => ({
      id: r.mintId(),
      label: item.label,
      checked: item.checked === true,
    }))
    place({ id, type: 'todo', marker, items: todo }, withinOf(el, r), 'list', r)
    r.found.text += 1
  }
  placeFileLinks(el, r)
  for (const part of partsWithin(el)) block(part, r)
}

const image = (el: Element, r: Reader) => {
  const img = el.tagName === 'img' ? el : findFirst(el, (child) => child.tagName === 'img')
  const source = img ? imageSource(img, r.baseUrl) : undefined
  if (!img || !source) return
  r.found.images += 1
  if (source === 'beside') return leaveOut('imageBeside', img, 'image', r)
  if (source === 'too-large') return leaveOut('imageTooLarge', img, 'image', r)
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
  scanAttributes(r)
  walk(root, r)
  listUncarriedLinks(r)
  const { blocks, provenance, databases } = settle(r)
  return {
    title: r.title,
    blocks,
    databases,
    tables: r.tables,
    leftOut: r.leftOut.list(),
    found: r.found,
    provenance,
    linkedImages: r.linkedImages,
  }
}
