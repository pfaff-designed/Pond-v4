/**
 * Charts (6z frame 3): "a chart must read a table, so Pond rebuilds it on the table
 * it was drawn from. If the file has only the picture, Pond makes the table from
 * its values, or lists the chart as not carried over."
 *
 * A chart in Pond is a `view` block in chart mode over a database, so whatever a
 * chart reads becomes a database. Nothing is run to find the data: it is either a
 * table the picture points at or shares a figure with, or values written on the
 * picture's own marks (`data-value`).
 */
import type { Element, Root } from 'hast'
import type { ViewChartConfig, ViewChartKind } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'
import { ancestor, descendants, findFirst, plainText, prop } from './hast'
import type { TableReading } from './tables'

const CHART_TAGS = new Set(['svg', 'canvas'])

/** Attributes that name the part of the file a picture describes. */
const POINTER_PROPS = ['ariaDescribedBy', 'ariaDetails', 'dataTable', 'dataSource']

/** `pace-chart` and `bar_graph` call themselves charts; `photograph` does not. */
const CHART_WORDS = /(^|[^a-z])(chart|graph|plot)s?([^a-z]|$)/i

const tableIn = (el: Element): Element | undefined =>
  el.tagName === 'table' ? el : findFirst(el, (candidate) => candidate.tagName === 'table')

/** The table a picture was drawn from: the one it points at, else the one in its figure. */
const sourceTable = (
  picture: Element,
  byId: Map<string, Element>,
  parents: Map<Element, Element>
): Element | undefined => {
  for (const name of POINTER_PROPS) {
    for (const id of (prop(picture, name) ?? '').split(/\s+/)) {
      const target = id ? byId.get(id) : undefined
      const table = target ? tableIn(target) : undefined
      if (table) return table
    }
  }
  const figure = ancestor(picture, parents, (up) => up.tagName === 'figure')
  return figure ? tableIn(figure) : undefined
}

/** Every chart picture in the file that reads a table, and that table. */
export const findChartSources = (
  root: Root,
  byId: Map<string, Element>,
  parents: Map<Element, Element>
): Map<Element, Element> => {
  const sources = new Map<Element, Element>()
  for (const el of descendants(root)) {
    if (!CHART_TAGS.has(el.tagName)) continue
    const table = sourceTable(el, byId, parents)
    if (table) sources.set(el, table)
  }
  return sources
}

/** Values written on the picture's marks, as the table the chart will read. */
export const markValues = (picture: Element): TableReading | undefined => {
  const marks = descendants(picture).filter((el) => {
    const value = prop(el, 'dataValue')
    return value !== undefined && value.trim() !== '' && Number.isFinite(Number(value))
  })
  if (marks.length === 0) return undefined
  return {
    columns: ['label', 'value'],
    rows: marks.map((mark, i) => {
      const title = findFirst(mark, (el) => el.tagName === 'title')
      const label =
        prop(mark, 'dataLabel') ?? prop(mark, 'dataX') ?? (title ? plainText(title) : `${i + 1}`)
      const value = (prop(mark, 'dataValue') ?? '').trim()
      return [
        { text: label, value: label },
        { text: value, value },
      ]
    }),
  }
}

/** The picture's own name: its label, or its `<title>`. */
export const pictureName = (picture: Element): string | undefined => {
  const label = prop(picture, 'ariaLabel')?.trim()
  if (label) return label
  const title = childTitle(picture)
  return title || undefined
}

const childTitle = (picture: Element): string => {
  const title = picture.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'title'
  )
  return title ? plainText(title) : ''
}

/** A picture reads as a chart when it has data, or calls itself one. */
export const looksLikeChart = (picture: Element, caption: string | undefined): boolean => {
  const words = [prop(picture, 'id'), prop(picture, 'className'), pictureName(picture), caption]
  return words.some((word) => word !== undefined && CHART_WORDS.test(word))
}

export const chartKind = (picture: Element): ViewChartKind => {
  const tags = new Set(descendants(picture).map((el) => el.tagName))
  if (tags.has('rect')) return 'bar'
  if (tags.has('path') || tags.has('polyline') || tags.has('line')) return 'line'
  return 'bar'
}

/** Along the date, else the first words; summing the first number, else counting records. */
export const chartConfig = (schema: PropertySchema, kind: ViewChartKind): ViewChartConfig => {
  const x =
    schema.find((def) => def.type === 'date') ??
    schema.find((def) => def.type === 'text') ??
    schema[0]
  const measure = schema.find((def) => def.type === 'number' && def.id !== x.id)
  return {
    kind,
    xProperty: x.id,
    series: [measure ? { property: measure.id, agg: 'sum' } : { property: x.id, agg: 'count' }],
  }
}
