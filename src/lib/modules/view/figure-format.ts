import type { ChartStatFlowFormat } from '@/components/charts/chart-stat-flow'
import type { ViewFigureFormat } from './schema'

/**
 * Figure formatting (#111) — pure, shared by the big-number view mode and
 * `serialize` so the AI's context and the rendered figure can never disagree.
 * The view hands `statFormatOptions` to ChartStatFlow (NumberFlow animates
 * through the same Intl options); serialize renders the identical string via
 * en-US Intl (pinned locale — serialize feeds prompts/embeddings and must be
 * deterministic across environments).
 *
 * Dependency direction: the format union lives in `schema.ts`, which value-imports
 * `aggregate.ts`, which value-imports this file. The import back is TYPE-only, so
 * it erases at compile and the runtime graph stays one-directional and acyclic.
 */

/** Intl options per figure format — the ChartStatFlow bridge. */
export function statFormatOptions(format?: ViewFigureFormat): ChartStatFlowFormat {
  switch (format) {
    case 'currency':
      // Whole dollars unless cents are present ($12,500 / $99.99). Currency is
      // USD by design — a locale/currency field can land when a real case hurts.
      return { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }
    case 'percent':
      // `value` is a FRACTION (0.62 → "62%"), matching Intl percent semantics.
      return { style: 'percent', maximumFractionDigits: 1 }
    default:
      return { style: 'decimal', maximumFractionDigits: 2 }
  }
}

/** The full formatted figure: prefix + Intl-formatted value + suffix. */
export function formatStatValue(data: {
  value: number
  format?: ViewFigureFormat
  prefix?: string
  suffix?: string
}): string {
  const formatted = new Intl.NumberFormat('en-US', statFormatOptions(data.format)).format(data.value)
  return `${data.prefix ?? ''}${formatted}${data.suffix ?? ''}`
}

/** Delta magnitude as a percent string (delta is a FRACTION: 0.045 → "4.5%"). */
function deltaPct(delta: number): string {
  return `${Math.round(Math.abs(delta) * 1000) / 10}%`
}

/** View form: trend glyph + magnitude — "▲ 12%" / "▼ 5%". Zero counts as up. */
export function formatStatDelta(delta: number): string {
  return `${delta < 0 ? '▼' : '▲'} ${deltaPct(delta)}`
}

/** Serialize form: explicitly signed — "+12%" / "-5%". */
export function signedStatDelta(delta: number): string {
  return `${delta < 0 ? '-' : '+'}${deltaPct(delta)}`
}
