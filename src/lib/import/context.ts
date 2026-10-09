/**
 * The reader's working state over one file, and where each part of it sits.
 */
import type { Element, Parents, Root } from 'hast'
import type { Block } from '@/lib/modules/content'
import { findChartSources } from './charts'
import {
  childElements,
  closestAncestors,
  descendants,
  findFirst,
  indexIds,
  indexParents,
  plainText,
  prop,
} from './hast'
import { collectLeftOut, type LeftOutCollector, type LeftOutKind } from './left-out'
import { joinPath, trackPaths, type PathTracker } from './provenance'
import type { Counts, ImportedDatabase, TableChoice } from './types'
import { resolveUrl } from './urls'

const SECTION_TAGS = new Set(['section', 'article'])
/** Where a page's own content lives; a header or footer inside one belongs to the page. */
const CONTENT_TAGS = new Set(['main', 'article', 'section', 'aside', 'figure', 'blockquote'])

/** What a placed block is, as its provenance names it: `section 2 › table`. */
export type PartKind =
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'definitions'
  | 'code'
  | 'list'
  | 'file'
  | 'image'
  | 'table'
  | 'chart'

/** What a left-out part is, as its place names it: `section 3 › map`. */
export type PartWord =
  | PartKind
  | 'styling'
  | 'script'
  | 'form'
  | 'buttons'
  | 'video'
  | 'audio'
  | 'map'
  | 'embedded app'
  | 'picture'
  | 'drawing'
  | 'link'
  | 'nav'
  | 'header'
  | 'footer'

export interface Figure {
  caption: string
  captionEl: Element | undefined
  used: boolean
}

/** A chart waiting for the database it reads, which may sit later in the file. */
export interface ChartDraft {
  id: string
  picture: Element
  table: Element
  label: string | undefined
  place: string
}

export type Draft = { block: Block; ticket: number } | { chart: ChartDraft; ticket: number }

/** A database before its place is worded, which needs the whole file read. */
export type DatabaseDraft = Omit<ImportedDatabase, 'from'>

export interface Reader {
  /** The file's `<base href>`, else its own address: what relative links resolve against. */
  baseUrl: string | undefined
  /** Every element in the file, in document order. */
  elements: Element[]
  mintId: () => string
  paths: PathTracker
  leftOut: LeftOutCollector
  within: Map<Element, string[]>
  inside: Map<Element, string[]>
  parents: Map<Element, Element>
  /** Element → the page content (`main`, `article`, …) it sits in. */
  contentOf: Map<Element, Element>
  /** Chart picture → the table it was drawn from. */
  chartSources: Map<Element, Element>
  drawnTables: Set<Element>
  /** Table → the database it became, for the charts that read it. */
  databases: Map<Element, DatabaseDraft>
  databaseDrafts: { database: DatabaseDraft; ticket: number }[]
  drafts: Draft[]
  tables: TableChoice[]
  found: Counts
  linkedImages: string[]
  /** Links whose address a placed block carries, as a markdown link or a file block. */
  carried: Set<Element>
  /** Parts already listed or never shown, so nothing inside them is listed again. */
  accounted: Set<Element>
  title: string
  /** The title's own heading is still to come, and is not repeated as a block. */
  titlePending: boolean
  lastHeading: string | undefined
  figure: Figure | undefined
}

export interface ReadDocumentOptions {
  mintId: () => string
  baseUrl: string | undefined
}

/** The sections every element sits in, and the section each section element opens. */
const mapSections = (root: Root, paths: PathTracker) => {
  const within = new Map<Element, string[]>()
  const inside = new Map<Element, string[]>()
  const opens = (el: Element, stack: string[]): string[] => {
    if (el.tagName === 'head') return ['head']
    if (SECTION_TAGS.has(el.tagName)) return [...stack, paths.section(stack)]
    return stack
  }
  const visit = (parent: Parents, stack: string[]) => {
    for (const el of childElements(parent)) {
      within.set(el, stack)
      const opened = opens(el, stack)
      if (opened !== stack) inside.set(el, opened)
      visit(el, opened)
    }
  }
  visit(root, [])
  return { within, inside }
}

/** The page's title: the file's `<title>`, else its first top-level heading. */
const documentTitle = (root: Root): string => {
  const head = findFirst(root, (el) => el.tagName === 'head')
  const title = head && childElements(head).find((el) => el.tagName === 'title')
  if (title && plainText(title)) return plainText(title)
  const body = findFirst(root, (el) => el.tagName === 'body')
  const h1 = body && findFirst(body, (el) => el.tagName === 'h1')
  return h1 ? plainText(h1) : ''
}

/** The first `<base href>`, resolved against the file's own address; else that address. */
const documentBase = (root: Root, fileUrl: string | undefined): string | undefined => {
  const base = findFirst(root, (el) => el.tagName === 'base' && prop(el, 'href') !== undefined)
  const href = base && prop(base, 'href')?.trim()
  return (href && resolveUrl(href, fileUrl)) || fileUrl
}

export const createReader = (root: Root, opts: ReadDocumentOptions): Reader => {
  const paths = trackPaths()
  const elements = descendants(root)
  const { within, inside } = mapSections(root, paths)
  const parents = indexParents(elements)
  const chartSources = findChartSources(elements, indexIds(elements), parents)
  const title = documentTitle(root)
  return {
    baseUrl: documentBase(root, opts.baseUrl),
    elements,
    mintId: opts.mintId,
    paths,
    leftOut: collectLeftOut(),
    within,
    inside,
    parents,
    contentOf: closestAncestors(elements, parents, (up) => CONTENT_TAGS.has(up.tagName)),
    chartSources,
    drawnTables: new Set(chartSources.values()),
    databases: new Map(),
    databaseDrafts: [],
    drafts: [],
    tables: [],
    found: { headings: 0, text: 0, tables: 0, charts: 0, images: 0 },
    linkedImages: [],
    carried: new Set(),
    accounted: new Set(),
    title,
    titlePending: title !== '',
    lastHeading: undefined,
    figure: undefined,
  }
}

export const withinOf = (el: Element, r: Reader): string[] => r.within.get(el) ?? []

/** The sections an element's own children sit in. */
export const insideOf = (el: Element, r: Reader): string[] => r.inside.get(el) ?? withinOf(el, r)

/** A left-out part's place: its sections and what it is, or just `head`. */
export const placeOf = (el: Element, word: PartWord, r: Reader): string => {
  const within = withinOf(el, r)
  return within[0] === 'head' ? 'head' : joinPath([...within, word])
}

export const leaveOut = (kind: LeftOutKind, el: Element, word: PartWord, r: Reader) => {
  r.accounted.add(el)
  r.leftOut.add(kind, placeOf(el, word, r))
}

export const place = (block: Block, within: string[], kind: PartKind, r: Reader) =>
  r.drafts.push({ block, ticket: r.paths.note(within, kind) })

/** The figure's caption, for the part it captions; it is not then a paragraph of its own. */
export const takeCaption = (r: Reader): string | undefined => {
  if (!r.figure) return undefined
  r.figure.used = true
  return r.figure.caption || undefined
}
