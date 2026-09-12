/**
 * Series render-state pure functions (C5) — the decisional bits Line and Area
 * share via `useSeriesRendering`. Pins the pulse-mode precedence (explicit
 * `loading={false}` → explicit `loadingPulseMode` → `loading={true}` loop →
 * chart-phase fallback) and the phase gate for series content visibility.
 */
import type { ChartPhase } from '@/components/charts/chart-phase'
import {
  isSeriesContentVisible,
  resolveSeriesPulseMode,
} from '@/components/charts/series-render-state'

const ALL_PHASES: ChartPhase[] = [
  'loading',
  'exiting',
  'gridTweenReady',
  'revealing',
  'ready',
  'exitingReady',
  'gridTweenLoading',
  'revealingLoading',
]

describe('resolveSeriesPulseMode', () => {
  it('loading={false} disables the pulse regardless of mode or phase', () => {
    for (const phase of ALL_PHASES) {
      expect(resolveSeriesPulseMode(phase, false, undefined)).toBeNull()
      expect(resolveSeriesPulseMode(phase, false, 'loop')).toBeNull()
      expect(resolveSeriesPulseMode(phase, false, 'enter')).toBeNull()
    }
  })

  it('an explicit loadingPulseMode wins over the phase fallback', () => {
    expect(resolveSeriesPulseMode('ready', undefined, 'exit')).toBe('exit')
    expect(resolveSeriesPulseMode('loading', undefined, 'enter')).toBe('enter')
    expect(resolveSeriesPulseMode('revealing', undefined, 'loop')).toBe('loop')
  })

  it('an explicit loadingPulseMode also wins over loading={true}', () => {
    expect(resolveSeriesPulseMode('ready', true, 'enter')).toBe('enter')
    expect(resolveSeriesPulseMode('loading', true, 'exit')).toBe('exit')
  })

  it('loading={true} without a mode forces a loop in every phase', () => {
    for (const phase of ALL_PHASES) {
      expect(resolveSeriesPulseMode(phase, true, undefined)).toBe('loop')
    }
  })

  it('with loading unset, the loading-side phases drive the mode', () => {
    expect(resolveSeriesPulseMode('loading', undefined, undefined)).toBe('loop')
    expect(resolveSeriesPulseMode('exiting', undefined, undefined)).toBe('exit')
    expect(resolveSeriesPulseMode('revealingLoading', undefined, undefined)).toBe('enter')
  })

  it('with loading unset, the remaining phases yield no pulse', () => {
    const pulselessPhases: ChartPhase[] = [
      'gridTweenReady',
      'revealing',
      'ready',
      'exitingReady',
      'gridTweenLoading',
    ]
    for (const phase of pulselessPhases) {
      expect(resolveSeriesPulseMode(phase, undefined, undefined)).toBeNull()
    }
  })
})

describe('isSeriesContentVisible', () => {
  it('is true only in the revealed phases (revealing / ready / exitingReady)', () => {
    const visiblePhases: ChartPhase[] = ['revealing', 'ready', 'exitingReady']
    for (const phase of ALL_PHASES) {
      expect(isSeriesContentVisible(phase)).toBe(visiblePhases.includes(phase))
    }
  })
})
