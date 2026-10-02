'use client'

/**
 * The AGGREGATE view modes' controls and the big-number renderer (#111).
 *
 * They live beside `view.tsx` rather than inside it because they answer a different
 * question from the other modes: table / board / calendar / gallery / gantt all PLACE
 * records, while chart and big-number READ them — every number is computed by
 * `aggregate.ts` / `chart-data.ts` from the collection's rows at render time. The
 * design law is the reason there is nothing else to keep: "the record is the source
 * of truth… nothing holds a copy." The chart renderer itself is `collection-chart.tsx`.
 */

import { useMemo } from 'react'
import { CHART_PRESENTATIONS, type ViewBlock, type ViewChartPresentation } from './schema'
import type { CollectionRow } from './apply'
import {
  AGG_LABELS,
  CHART_KINDS,
  VIEW_AGGS,
  bigNumberFromRows,
  figureFormatOptions,
  signedDelta,
  type ChartKind,
  type ViewAgg,
} from './aggregate'
import { resolveChartConfig } from './chart-data'
import { COMPACT_CHART_MARK } from './chart-compact'
import { KICKER } from '../chart/card'
import type { PropertySchema } from '@/lib/properties/schema'
import { ChartStatFlow } from '@/components/charts/chart-stat-flow'

const CONTROL_INPUT =
  'rounded-mn-chrome shadow-mn-sm bg-transparent px-1 py-0.5 text-xs text-mn-text outline-none'

/** The shared terse `<select>` shell every view control uses. */
export function ControlSelect({
  label,
  aria,
  value,
  onChange,
  children,
}: {
  /** The visible, terse label beside the select. */
  label: string
  /** The accessible name, when it should read fuller than the visible label. */
  aria?: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-mn-text-secondary">
      {label}
      <select
        aria-label={aria ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL_INPUT}
      >
        {children}
      </select>
    </label>
  )
}

/** The aggregation-verb options, shared by the chart series and the big-number figure. */
function aggOptions() {
  return VIEW_AGGS.map((a) => (
    <option key={a} value={a}>
      {AGG_LABELS[a]}
    </option>
  ))
}

/** The kinds that read a reference figure: a gauge's goal, a composed chart's target line. */
const TARGET_KINDS: readonly ChartKind[] = ['gauge', 'composed']

/**
 * Chart-mode config (#111): which KIND, which property buckets the x axis, and which
 * property is plotted with which verb. Single-series on purpose — the same restraint
 * as the single-clause filter (decision 15); a second series is a real multi-series
 * gesture, not a checkbox. Gauge and composed add one number: the target (#94).
 *
 * Every change rewrites the whole `chart` config, so a half-configured chart can't
 * exist: the picker always emits a complete `{ kind, xProperty, series }`.
 */
export function ChartControls({
  config,
  schema,
  onConfigChange,
}: {
  config: ViewBlock
  schema: PropertySchema
  onConfigChange: (patch: Partial<ViewBlock>) => void
}) {
  const inferred = resolveChartConfig(schema, config.chart)
  const seriesProp = config.chart?.series[0]
  const kind = config.chart?.kind ?? inferred.kind
  // SPREAD the existing config, never an explicit field list. This rebuilds the
  // whole `chart` object, so any field left out is ERASED by the next control
  // change — `stacked` was, which silently un-stacked a stacked view, and `#259`'s
  // `presentation` would have been next. Spreading makes that whole class of bug
  // impossible rather than fixing one instance. Covered by `chart-controls.test.tsx`.
  const write = (patch: Partial<NonNullable<ViewBlock['chart']>>) =>
    onConfigChange({
      chart: {
        ...config.chart,
        kind,
        series: config.chart?.series ?? [{ property: '', agg: 'count' }],
        ...patch,
      },
    })

  return (
    <>
      <ControlSelect label="Chart" value={kind} onChange={(v) => write({ kind: v as ChartKind })}>
        {CHART_KINDS.map((k) => (
          <option key={k} value={k}>
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="By"
        value={config.chart?.xProperty ?? ''}
        onChange={(v) => write({ xProperty: v || undefined })}
      >
        <option value="">Each record</option>
        {schema.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="Plot"
        value={seriesProp?.property ?? ''}
        onChange={(v) => write({ series: [{ property: v, agg: seriesProp?.agg ?? 'sum' }] })}
      >
        <option value="">Record count</option>
        {schema.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="as"
        value={seriesProp?.agg ?? 'sum'}
        onChange={(v) =>
          write({ series: [{ property: seriesProp?.property ?? '', agg: v as ViewAgg }] })
        }
      >
        {aggOptions()}
      </ControlSelect>

      {/* #259: only the kinds with a compact mark offer the choice — never a dead control. */}
      {COMPACT_CHART_MARK[kind] && (
        <ControlSelect
          label="Show"
          value={config.chart?.presentation ?? 'card'}
          onChange={(v) => write({ presentation: v as ViewChartPresentation })}
        >
          {CHART_PRESENTATIONS.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </ControlSelect>
      )}

      {TARGET_KINDS.includes(kind) && (
        <label className="flex items-center gap-1 text-xs text-mn-text-secondary">
          Target
          <input
            type="number"
            aria-label="Target"
            placeholder={kind === 'gauge' ? 'records' : '—'}
            value={config.chart?.target ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value)
              write({ target: e.target.value === '' || !Number.isFinite(n) ? undefined : n })
            }}
            className={`${CONTROL_INPUT} w-20 tabular-nums`}
          />
        </label>
      )}
    </>
  )
}

/**
 * Big-number-mode config (#111): the ONE property this page's figure reads, its verb,
 * and its format. This is the mode a data page leads with (#94's "one oversized figure,
 * not a chart"), so its config stays to three choices.
 */
export function BigNumberControls({
  config,
  schema,
  onConfigChange,
}: {
  config: ViewBlock
  schema: PropertySchema
  onConfigChange: (patch: Partial<ViewBlock>) => void
}) {
  const current = config.bigNumber
  const write = (patch: Partial<NonNullable<ViewBlock['bigNumber']>>) =>
    onConfigChange({
      bigNumber: {
        property: current?.property,
        agg: current?.agg ?? 'sum',
        format: current?.format,
        delta: current?.delta,
        ...patch,
      },
    })

  return (
    <>
      <ControlSelect
        label="Figure"
        value={current?.property ?? ''}
        onChange={(v) => write({ property: v || undefined, ...(v ? {} : { agg: 'count' }) })}
      >
        <option value="">Record count</option>
        {schema.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </ControlSelect>

      <ControlSelect
        label="as"
        value={current?.agg ?? 'sum'}
        onChange={(v) => write({ agg: v as ViewAgg })}
      >
        {aggOptions()}
      </ControlSelect>

      <ControlSelect
        label="Format"
        value={current?.format ?? 'number'}
        onChange={(v) => write({ format: v as NonNullable<ViewBlock['bigNumber']>['format'] })}
      >
        <option value="number">Number</option>
        <option value="currency">Currency</option>
        <option value="percent">Percent</option>
      </ControlSelect>
    </>
  )
}

/**
 * Big-number mode — ONE oversized figure aggregated from the collection's records.
 *
 * The product stance on #94: "data pages lead with one oversized figure, not a chart."
 * This is that surface, and it is a VIEW, so the figure is always live: change a row's
 * number in the table and this reads the new total, because there is no copy.
 *
 * The plain formatted value rides an aria-label (like the retired `stat` block) so
 * assistive tech and story tests read one stable string while NumberFlow animates the
 * digits underneath.
 */
export function CollectionBigNumber({
  schema,
  rows,
  bigNumber,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  bigNumber?: ViewBlock['bigNumber']
}) {
  const figure = useMemo(
    () => bigNumberFromRows(rows, schema, bigNumber),
    [rows, schema, bigNumber]
  )
  const records = `over ${figure.recordCount} record${figure.recordCount === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col items-start py-1 text-mn-text">
      <span role="status" aria-label={`${figure.label}: ${figure.formatted}`}>
        {figure.value === null ? (
          <span aria-hidden className="flex flex-col items-start">
            <span className="text-4xl font-bold tracking-tight tabular-nums text-mn-text">—</span>
            <span className={KICKER}>{figure.label}</span>
          </span>
        ) : (
          <span aria-hidden className="flex flex-col items-start">
            <ChartStatFlow
              value={figure.value}
              label={figure.label}
              formatOptions={figureFormatOptions(bigNumber?.format)}
              valueClassName="text-4xl font-bold tracking-tight text-mn-text tabular-nums"
              labelClassName={KICKER}
            />
          </span>
        )}
      </span>
      {figure.delta !== undefined && (
        <span className="mt-1 font-mono text-xs tabular-nums text-mn-text-secondary">
          {signedDelta(figure.delta)}
        </span>
      )}
      <span className="mt-0.5 text-xs text-mn-text-secondary">{records}</span>
    </div>
  )
}
