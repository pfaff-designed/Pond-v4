import { detectAxis, layoutScatter, leastSquares } from './scatter-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

describe('detectAxis', () => {
  it('tells numbers, dates and categories apart', () => {
    expect(detectAxis(['5.2', '7', '8.5'])).toBe('numeric')
    expect(detectAxis(['2026-09-01', '2026-09-02'])).toBe('date')
    expect(detectAxis(['push', 'pull'])).toBe('ordinal')
    expect(detectAxis([])).toBe('ordinal')
  })
})

describe('leastSquares', () => {
  it('fits an exact line and refuses a spread-less x', () => {
    expect(leastSquares([1, 2, 3], [3, 5, 7])).toEqual({ a: 1, b: 2 })
    expect(leastSquares([2, 2, 2], [1, 2, 3])).toBeNull()
  })
})

describe('layoutScatter', () => {
  const nights: FigurePoint[] = [
    { x: '5', values: { Energy: 2 } },
    { x: '7', values: { Energy: 5 } },
    { x: '9', values: { Energy: 8 } },
    { x: '6', values: {} },
  ]

  it('places one dot per record with a value and fits a trend on a numeric axis', () => {
    const layout = layoutScatter(nights, ['Energy'], 284, 124)!
    expect(layout.axis).toBe('numeric')
    expect(layout.dots[0]).toHaveLength(3)
    expect(layout.trend).not.toBeNull()
    // Dots rise with the data: the 9h night is highest (smallest y).
    expect(layout.dots[0][2].y).toBeLessThan(layout.dots[0][0].y)
  })

  it('draws no trend on an ordinal axis or with fewer than three dots', () => {
    expect(layoutScatter([{ x: 'a', values: { V: 1 } }, { x: 'b', values: { V: 2 } }, { x: 'c', values: { V: 3 } }], ['V'], 284, 124)!.trend).toBeNull()
    expect(layoutScatter(nights.slice(0, 2), ['Energy'], 284, 124)!.trend).toBeNull()
  })

  it('returns null when no series carries a value', () => {
    expect(layoutScatter([{ x: '1', values: {} }], ['Energy'], 284, 124)).toBeNull()
  })
})
