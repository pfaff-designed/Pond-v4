/**
 * The chart card's pure half (#227) — everything `PondChart.dc.html` says that is
 * not a pixel: its state axis, the thirteen type tags, the copy its empty and error
 * states speak, and the two provenance strings its footer reads. No React, so a
 * server-safe module and a unit test can reach every word; `card.tsx` draws them.
 *
 * Every literal is the board's own — `renderVals()` in `PondChart.dc.html` and the
 * `type` strings `pond-charts.js` exports — read off `wayfinder/board-values.generated.json`.
 */
import type { ChartKind } from '@/lib/modules/view/aggregate'
import type { PropertyDef } from '@/lib/properties/schema'
import type { PageRow } from '@/lib/pages/tree'
import { crumbTrail } from '@/lib/pages/crumbs'

/**
 * The board's `state` enum, verbatim and in its order. Seven, not the block shell's
 * eight: a chart card has no `deleted` — the tombstone belongs to `PondBlock`.
 */
export const CHART_CARD_STATES = [
  'rest',
  'hover',
  'selected',
  'empty',
  'loading',
  'error',
  'disabled',
] as const
export type ChartCardState = (typeof CHART_CARD_STATES)[number]

/**
 * The board's `typeTag` — the mono word on the right of the head row — per kind:
 * `pond-charts.js`'s own `type` string for each of the thirteen, which is what
 * `PondChart.dc.html` renders as `typeText`. The one owner of the thirteen words;
 * the source picker derives its row labels from this table (`CHART_LABEL`,
 * `source-entries.ts`) with its own board's single documented exception, so the
 * day a kind is renamed here the picker follows. `Record<ChartKind, string>` so a
 * fourteenth kind cannot arrive untagged.
 */
export const CHART_TYPE_TAG: Record<ChartKind, string> = {
  line: 'line',
  area: 'area + reference area',
  bar: 'bar',
  composed: 'composed + projection',
  net: 'profit / loss line',
  heatmap: 'heatmap',
  ring: 'ring',
  gauge: 'gauge',
  radar: 'radar',
  scatter: 'scatter',
  sankey: 'sankey',
  sunburst: 'sunburst',
  funnel: 'funnel',
}

/** The footer's two label words, as the board writes them. */
export const CHART_FOOT_LABELS = { on: 'on', reads: 'reads' } as const

/**
 * The word the board falls back to when a chart has no named source —
 * `const source = (C.reads || '').split(' · ')[0] || 'this table'`. Reachable only
 * off a page host (Storybook, the terminal's reference render), where no
 * collection can be named.
 */
export const CHART_SOURCE_FALLBACK = 'this table'

/** `empty` — `no rows in {{ source }} yet`, and the one action the box offers. */
export const chartEmptyLine = (source: string = CHART_SOURCE_FALLBACK) => `no rows in ${source} yet`
export const CHART_EMPTY_ACTION = 'add a row'

/** `error` — the notice's title (curly apostrophe, as authored) and its action. */
export const chartErrorLine = (source: string = CHART_SOURCE_FALLBACK) =>
  `can’t reach ${source} · showing the last copy`
export const CHART_ERROR_ACTION = 'reconnect'

/**
 * The board's `skel`: four bars, all radius 6 at ink .08, in a column at gap 12
 * under `paddingTop: 10` — `[['70%', 10], ['100%', 90], ['85%', 10], ['60%', 10]]`.
 * Literal class pairs (Tailwind scans source for arbitrary values); the stories
 * measure each bar against the numbers.
 */
export type ChartSkeletonBar = readonly [width: string, height: string]
export const CHART_SKELETON: readonly ChartSkeletonBar[] = [
  ['w-[70%]', 'h-[10px]'],
  ['w-full', 'h-[90px]'],
  ['w-[85%]', 'h-[10px]'],
  ['w-[60%]', 'h-[10px]'],
]

/**
 * The `reads` value — `weigh-ins · date, kg`: the source, then the fields the chart
 * actually read, in the order it reads them (the x field, then each series). The
 * fields are the RESOLVED config's `PropertyDef`s (`resolveChartConfig`), so the
 * line names what the plot was drawn from, never what the config merely asked
 * for. A chart that reads no field (a count bucketed by record title) names the
 * source alone — true, and shorter.
 */
export function chartReads(
  source: string,
  fields: readonly (Pick<PropertyDef, 'name'> | undefined)[]
): string {
  const names: string[] = []
  for (const f of fields) {
    if (f && f.name && !names.includes(f.name)) names.push(f.name)
  }
  return names.length ? `${source} · ${names.join(', ')}` : source
}

/**
 * The `on` value — `life › health › weight`: the HOST page's path, root first,
 * through the one breadcrumb rule (`crumbTrail`) so the card and the pill can never
 * disagree about which root a page sits under (`databases › ingredients`, never
 * `life › databases › ingredients`). `rootLabel` is the home row's own title —
 * what the breadcrumb starts at (AUDIT W9) — with the pill's own `life` fallback.
 * The home row is never among the rows, so the root page itself reads as its label
 * alone.
 */
export function chartOnPath(rows: readonly PageRow[], pageId: string, rootLabel = 'life'): string {
  const list = rows as PageRow[]
  const trail = crumbTrail(list, pageId)
  const own = list.find((r) => r.id === pageId)
  const parts = [trail.root?.title ?? rootLabel, ...trail.crumbs.map((c) => c.title)]
  // The databases root page is its own trail root (`crumbTrail`); don't name it twice.
  if (own && trail.root?.id !== pageId) parts.push(own.title || 'Untitled')
  return parts.join(' › ')
}

/**
 * The source collection's name for `reads`, the empty line and the error line. An
 * inline view (no `collectionId`) draws its HOST page's own rows, so `collectionId`
 * IS the page id and the source is the page itself — the honest reading, and the
 * one `viewCollectionId` already makes. Lowercase `untitled` for a nameless
 * collection, as the source picker names it (`source-databases.ts`): the same
 * object in the same machine register.
 */
export function chartSourceTitle(
  rows: readonly PageRow[],
  collectionId: string
): string | undefined {
  const row = rows.find((r) => r.id === collectionId)
  return row ? row.title || 'untitled' : undefined
}

export interface ChartProvenance {
  /** The host page's path — the footer's `on` row. Absent off a page host. */
  on?: string
  /** The source collection's title — `reads`, the empty line, the error line. */
  source?: string
}

/** Both provenance strings off the shared `['pages']` rows, in one call. */
export function chartProvenance(
  rows: readonly PageRow[],
  pageId: string | undefined,
  collectionId: string | undefined,
  rootLabel?: string
): ChartProvenance {
  return {
    on: pageId ? chartOnPath(rows, pageId, rootLabel) : undefined,
    source: collectionId ? chartSourceTitle(rows, collectionId) : undefined,
  }
}
