'use client'

import { PondChartSvg } from '../pond/pond-chart-svg'
import { FILL_SOFT, FILL_STRONG, FONT_LABEL, FONT_NUMERAL, INK, LABEL } from '../pond/pond-chart-style'
import { formatValue } from '../pond/linear-scale'
import { gaugeHeight, layoutGauge } from './gauge-layout'

export interface GaugeChartProps {
  /** The figure reached. */
  value: number
  /** The figure to reach — the arc fills `value / target`. */
  target: number
  /** What the figure counts ("books", "records") — read under the numeral as "of 30 books". */
  unit: string
  label?: string
}

/**
 * Gauge: a half ring — soft ink track, strong ink progress — with the figure as
 * a 34px numeral in the bowl and "of {target} {unit}" beneath. The one data page
 * shape that is a FIGURE first and a chart second (PROJECT_RULES).
 */
export function GaugeChart({ value, target, unit, label = 'Gauge' }: GaugeChartProps) {
  return (
    <PondChartSvg height={gaugeHeight} label={label}>
      {(width, height) => {
        const g = layoutGauge(value, target, width, height)
        return (
          <>
            <path d={g.track} fill={FILL_SOFT} />
            {g.progress && <path d={g.progress} fill={FILL_STRONG} />}
            <text
              x={g.cx}
              y={g.cy - 8}
              fontSize={FONT_NUMERAL}
              fontWeight={500}
              textAnchor="middle"
              fill={INK}
              letterSpacing={-1}
            >
              {formatValue(value)}
            </text>
            <text x={g.cx} y={g.cy + 10} fontSize={FONT_LABEL} fill={LABEL} textAnchor="middle">
              {`of ${formatValue(target)} ${unit}`}
            </text>
            <text x={g.cx - g.outer} y={g.cy + 18} fontSize={FONT_LABEL} fill={LABEL} textAnchor="middle">
              0
            </text>
            <text x={g.cx + g.outer} y={g.cy + 18} fontSize={FONT_LABEL} fill={LABEL} textAnchor="middle">
              {formatValue(target)}
            </text>
          </>
        )
      }}
    </PondChartSvg>
  )
}
