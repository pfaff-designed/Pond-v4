'use client'

/**
 * The chart CARD presentation of the `chart` view mode (#227) — the host that
 * decides the card's state and its five head/foot strings, then hands the plot
 * (`ChartKind`, `collection-chart.tsx`) to the chrome (`chart/card.tsx`).
 *
 * Which of the board's five strings has a true source today:
 *
 *   title   the block's own `label` (#258) — omitted when the block has none
 *   typeTag `CHART_TYPE_TAG[kind]` off the resolved config
 *   sub     nothing derives a description of the window — OMITTED, never invented
 *   on      the host page's path, from the shared `['pages']` cache (`useChartProvenance`)
 *   reads   the source collection's title + the RESOLVED fields (`resolveChartConfig`)
 *
 * The empty state asks two different questions, and only one has `add a row` as its
 * honest answer (#239 review):
 *
 *   the collection has no rows      `no rows in {source} yet` + `add a row` (when wired)
 *   rows exist, the filter hides all `nothing matches this filter`, no action
 *   rows exist, none carries a number `no data yet`, no action
 *
 * `error` is the collection the card cannot read — deleted, or a fetch that failed.
 * It carries its own sentence, because `can’t reach … · showing the last copy` and
 * its `reconnect` action are only true of a source that is still there.
 *
 * `loading` is the card's own four-bar skeleton with the head and the footer it can
 * already name (the fields arrive with the schema, so `reads` is the source alone
 * until then — incomplete, never false).
 */

import { useMemo } from 'react'
import type { ViewBlock } from './schema'
import type { CollectionRow } from './apply'
import { chartDataFromRows, resolveChartConfig } from './chart-data'
import { ChartKind } from './collection-chart'
import { seriesNames } from '../chart/data'
import { ChartCard, CHART_EMPTY_LINE } from '../chart/card'
import { chartReads, type ChartCardState, type ChartProvenance } from '../chart/chrome'
import { POND_BLOCK_FILTERED_EMPTY_LINE } from '../block-frame'
import { blockLabel } from '../types'
import { useBlockRow } from '../block-row-context'
import type { PropertySchema } from '@/lib/properties/schema'

export interface CollectionChartProps {
  config: ViewBlock
  /** `null` only while loading — the host draws the skeleton, not a plot. */
  schema: PropertySchema | null
  /** The rows the view draws — its filter and sort applied. */
  rows: CollectionRow[]
  /** How many rows the collection holds BEFORE the filter — decides which empty line is true. */
  totalRows: number
  isLoading?: boolean
  /**
   * The collection could not be read — gone, or the fetch failed. Draws the card's
   * `error` state with this sentence. Without it a chart whose rows never arrived
   * would say `no rows in {source} yet`, which is a false statement about the data
   * — the exact failure #239 ruled on — and would offer a live `add a row`.
   */
  errorLine?: string
  provenance?: ChartProvenance
  /** The collection's own insert path; present only on the live editable host. */
  onAddRow?: () => void
}

export function CollectionChart({
  config,
  schema,
  rows,
  totalRows,
  isLoading,
  errorLine,
  provenance,
  onAddRow,
}: CollectionChartProps) {
  const resolved = useMemo(
    () => resolveChartConfig(schema ?? [], config.chart),
    [schema, config.chart]
  )
  const data = useMemo(
    () => (schema ? chartDataFromRows(rows, schema, config.chart) : null),
    [rows, schema, config.chart]
  )
  const names = data ? data.series.map((s) => s.name) : []

  let state: ChartCardState = 'rest'
  let emptyLine: string | undefined
  let onEmptyAction: (() => void) | undefined
  if (errorLine !== undefined) {
    state = 'error'
  } else if (isLoading || !data) {
    state = 'loading'
  } else if (totalRows === 0) {
    state = 'empty'
    onEmptyAction = onAddRow
  } else if (rows.length === 0) {
    state = 'empty'
    emptyLine = POND_BLOCK_FILTERED_EMPTY_LINE
  } else if (seriesNames(data.points).length === 0) {
    state = 'empty'
    emptyLine = CHART_EMPTY_LINE
  }

  // Pointer-selected (KAN-344): the chart card bypasses `PondBlock` (#227), so
  // the row host's selection reaches it through `BlockRowContext` instead.
  // Never overrides empty/loading/error — same precedence `PondBlock` itself
  // applies, only on top of `rest`.
  const { selected } = useBlockRow()
  if (selected && state === 'rest') state = 'selected'

  const source = provenance?.source
  const reads =
    source === undefined
      ? undefined
      : chartReads(source, [resolved.xDef, ...resolved.series.map((s) => s.def)])

  return (
    <ChartCard
      kind={resolved.kind}
      title={blockLabel(config)}
      on={provenance?.on}
      reads={reads}
      state={state}
      source={source}
      emptyLine={emptyLine}
      errorLine={errorLine}
      onEmptyAction={onEmptyAction}
    >
      {data && <ChartKind data={data} names={names} />}
    </ChartCard>
  )
}
