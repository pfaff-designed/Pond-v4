'use client'

import type { ModuleViewProps } from '../types'
import type { StatBlock } from './schema'
import { formatStatDelta, formatStatValue, statFormatOptions } from './format'
import { KICKER } from '../chart/card'
import { ChartStatFlow } from '@/components/charts/chart-stat-flow'

/**
 * `stat` view (#12). Read-only, AI-maintained: the headline figure via the Bklit
 * `ChartStatFlow` (NumberFlow count-up once its custom element registers; static
 * Intl string before that), the label in the shared module-card KICKER voice,
 * an up/down trend line from `delta`, and a muted caption. Colours stay neutral
 * zinc like the sibling modules — the trend reads through the glyph, and brand
 * accents land with the token reconciliation tickets, not here.
 *
 * The aria-label on the figure carries the plain formatted value so assistive
 * tech (and story tests) read one stable string even while NumberFlow visually
 * animates split digits — the same pattern as MetricView.
 */
export function StatView({ data }: ModuleViewProps<StatBlock>) {
  return (
    <div className="flex flex-col items-start py-1 text-mn-text">
      <span role="status" aria-label={`${data.label}: ${formatStatValue(data)}`}>
        <span aria-hidden className="flex flex-col items-start">
          <ChartStatFlow
            value={data.value}
            label={data.label}
            formatOptions={statFormatOptions(data.format)}
            prefix={data.prefix}
            suffix={data.suffix}
            valueClassName="text-3xl font-bold tracking-tight text-mn-text tabular-nums"
            labelClassName={KICKER}
          />
        </span>
      </span>
      {data.delta !== undefined && (
        <span className="mt-1 font-mono text-xs tabular-nums text-mn-text-secondary">
          {formatStatDelta(data.delta)}
        </span>
      )}
      {data.caption && <span className="mt-0.5 text-xs text-mn-text-faint">{data.caption}</span>}
    </div>
  )
}
