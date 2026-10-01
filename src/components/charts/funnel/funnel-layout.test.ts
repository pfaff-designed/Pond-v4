import { layoutFunnel } from './funnel-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

describe('layoutFunnel', () => {
  const recipes: FigurePoint[] = [
    { x: 'saved', values: { Count: 42 } },
    { x: 'cooked', values: { Count: 18 } },
    { x: 'cooked twice', values: { Count: 9 } },
    { x: 'on rotation', values: { Count: 4 } },
  ]

  it('reads each step as a share of the first — the mockup widths', () => {
    const steps = layoutFunnel(recipes, 'Count')
    expect(steps.map((s) => s.share)).toEqual([1, 18 / 42, 9 / 42, 4 / 42])
    expect(steps.map((s) => s.rank)).toEqual([0, 1, 2, 3])
  })

  it('clamps a step wider than the mouth and skips steps without a value', () => {
    const steps = layoutFunnel([...recipes, { x: 'surge', values: { Count: 90 } }, { x: 'blank', values: {} }], 'Count')
    expect(steps).toHaveLength(5)
    expect(steps[4].share).toBe(1)
  })

  it('reads a zero mouth as all-zero shares, never NaN', () => {
    expect(layoutFunnel([{ x: 'a', values: { Count: 0 } }], 'Count')[0].share).toBe(0)
  })
})
