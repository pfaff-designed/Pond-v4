/**
 * Funnel geometry — PondChart "funnel": ordered steps, each bar's width the
 * step's share of the FIRST step (the mouth), centred, fills fading by step.
 * A step larger than the mouth is clamped to full width rather than overflowing.
 */
import type { FigurePoint } from '../pond/pond-chart-data'

export interface FunnelStep {
  label: string
  value: number
  /** 0…1 of the first step. */
  share: number
  rank: number
}

export const FUNNEL_ROW_H = 24
export const FUNNEL_GAP = 6

export function layoutFunnel(points: readonly FigurePoint[], series: string): FunnelStep[] {
  const steps = points
    .map((p) => ({ label: p.x, value: p.values[series] }))
    .filter((s): s is { label: string; value: number } => typeof s.value === 'number' && s.value >= 0)
  const mouth = steps[0]?.value ?? 0
  return steps.map((s, i) => ({
    label: s.label,
    value: s.value,
    share: mouth > 0 ? Math.min(1, s.value / mouth) : 0,
    rank: i,
  }))
}
