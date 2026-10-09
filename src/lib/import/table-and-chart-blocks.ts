/**
 * The blocks a file's data becomes: a table becomes a table block, or a database
 * with a table view; a chart becomes a chart view over the database it reads, once
 * the whole file is read. Files a table's cells link to follow it as file blocks.
 */
import type { Element } from 'hast'
import type { Block } from '@/lib/modules/content'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { chartConfig, chartKind, looksLikeChart, markValues, pictureName } from './charts'
import {
  leaveOut,
  placeOf,
  takeCaption,
  withinOf,
  type DatabaseDraft,
  type Reader,
} from './context'
import { plainText } from './hast'
import { linksWithin } from './inline'
import { fileLink, imageBlock } from './media'
import { decideTable, readTable, toDatabase, toTableBlock, type TableReading } from './tables'
import type { ImportedDatabase } from './types'

const addDatabase = (
  reading: TableReading,
  title: string,
  ticket: number,
  r: Reader
): DatabaseDraft => {
  const id = r.mintId()
  const database = { id, title, ...toDatabase(reading, r.mintId) }
  r.databaseDrafts.push({ database, ticket })
  return database
}

const chartView = (
  id: string,
  database: DatabaseDraft,
  label: string | undefined,
  picture: Element
): ViewBlock => ({
  id,
  type: 'view',
  mode: 'chart',
  collectionId: database.id,
  ...(label ? { label } : {}),
  chart: chartConfig(database.schema, chartKind(picture)),
})

/** Each link in a list's items or a table's cells to a file on the web, as a file block after it. */
export const placeFileLinks = (el: Element, r: Reader) => {
  for (const a of linksWithin(el)) {
    const url = fileLink(a, r.baseUrl)
    if (!url) continue
    r.carried.add(a)
    const ticket = r.paths.note(withinOf(el, r), 'file')
    r.drafts.push({ block: imageBlock(r.mintId(), url, plainText(a) || undefined), ticket })
  }
}

export const table = (el: Element, r: Reader) => {
  const reading = readTable(el, r.baseUrl)
  if (reading.columns.length === 0) return
  r.found.tables += 1
  const caption = reading.caption ?? takeCaption(r)
  const decision = decideTable(reading, r.drawnTables.has(el))
  const ticket = r.paths.note(withinOf(el, r), 'table')
  const id = r.mintId()
  const rows = reading.rows.length
  if (decision.became === 'table') {
    r.drafts.push({ block: toTableBlock({ ...reading, caption }, id, r.mintId), ticket })
    r.tables.push({ blockId: id, ...decision, rows })
    for (const cell of reading.rows.flat()) for (const a of cell.links) r.carried.add(a)
  } else {
    const database = addDatabase(reading, caption ?? r.lastHeading ?? 'table', ticket, r)
    r.databases.set(el, database)
    r.drafts.push({ block: { id, type: 'view', mode: 'table', collectionId: database.id }, ticket })
    r.tables.push({ blockId: id, ...decision, rows, databaseId: database.id })
  }
  placeFileLinks(el, r)
}

/** An `svg` or `canvas`: a chart on its table, a chart on its own values, or listed. */
export const picture = (el: Element, r: Reader) => {
  const caption = takeCaption(r)
  const label = caption ?? pictureName(el)
  const source = r.chartSources.get(el)
  const values = source ? undefined : markValues(el)
  if (!source && !values && !looksLikeChart(el, caption)) {
    return el.tagName === 'canvas'
      ? leaveOut('scriptPicture', el, 'picture', r)
      : leaveOut('drawing', el, 'drawing', r)
  }
  r.found.charts += 1
  const within = withinOf(el, r)
  if (source) {
    const chart = {
      id: r.mintId(),
      picture: el,
      table: source,
      label,
      place: placeOf(el, 'chart', r),
    }
    r.drafts.push({ chart, ticket: r.paths.note(within, 'chart') })
    return
  }
  if (!values) return leaveOut('chartPicture', el, 'chart', r)
  const ticket = r.paths.note(within, 'chart')
  const id = r.mintId()
  const database = addDatabase(values, label ?? 'chart', ticket, r)
  r.drafts.push({ block: chartView(id, database, label, el), ticket })
}

/** Every block in file order, each chart reading the database its table became. */
export const settle = (
  r: Reader
): { blocks: Block[]; provenance: Record<string, string>; databases: ImportedDatabase[] } => {
  const blocks: Block[] = []
  const provenance: Record<string, string> = {}
  for (const draft of r.drafts) {
    if ('block' in draft) {
      blocks.push(draft.block)
      provenance[draft.block.id] = r.paths.resolve(draft.ticket)
      continue
    }
    const { id, picture: drawn, table: source, label, place } = draft.chart
    const database = r.databases.get(source)
    if (!database) {
      r.leftOut.add('chartPicture', place)
      continue
    }
    blocks.push(chartView(id, database, label, drawn))
    provenance[id] = r.paths.resolve(draft.ticket)
  }
  const databases = r.databaseDrafts.map(({ database, ticket }) => ({
    ...database,
    from: r.paths.resolve(ticket),
  }))
  return { blocks, provenance, databases }
}
