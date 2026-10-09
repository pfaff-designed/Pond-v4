/**
 * The parts of a file that hold data: tables, and the charts drawn from them. A
 * table becomes a table block or a database with a table view; a chart becomes a
 * chart view over the database it reads, once the whole file is read.
 */
import type { Element } from 'hast'
import type { Block } from '@/lib/modules/content'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { chartConfig, chartKind, looksLikeChart, markValues, pictureName } from './charts'
import { leaveOut, placeOf, takeCaption, withinOf, type Reader } from './context'
import { decideTable, readTable, toDatabase, toTableBlock, type TableReading } from './tables'
import type { ImportedDatabase } from './types'

const addDatabase = (
  reading: TableReading,
  title: string,
  ticket: number,
  r: Reader
): ImportedDatabase => {
  const id = r.mintId()
  const { schema, records } = toDatabase(reading, r.mintId)
  const database: ImportedDatabase = { id, title, schema, records, from: '' }
  r.databaseTickets.set(database, ticket)
  return database
}

const chartView = (
  id: string,
  database: ImportedDatabase,
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

export const table = (el: Element, r: Reader) => {
  const reading = readTable(el)
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
    return
  }
  const database = addDatabase(reading, caption ?? r.lastHeading ?? 'table', ticket, r)
  r.databases.set(el, database)
  r.drafts.push({ block: { id, type: 'view', mode: 'table', collectionId: database.id }, ticket })
  r.tables.push({ blockId: id, ...decision, rows, databaseId: database.id })
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
export const settle = (r: Reader): { blocks: Block[]; provenance: Record<string, string> } => {
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
  return { blocks, provenance }
}
