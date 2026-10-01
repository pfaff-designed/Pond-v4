import { extent, formatTick, formatValue, linearScale, niceStep, niceTicks } from './linear-scale'

describe('linearScale', () => {
  it('maps a domain onto a range, inverted ranges included', () => {
    const y = linearScale(0, 100, 150, 0)
    expect(y(0)).toBe(150)
    expect(y(50)).toBe(75)
    expect(y(100)).toBe(0)
  })

  it('collapses a degenerate domain to the range midpoint instead of dividing by zero', () => {
    expect(linearScale(5, 5, 0, 100)(5)).toBe(50)
  })
})

describe('extent + niceTicks', () => {
  it('finds the finite extent and ignores NaN', () => {
    expect(extent([3, NaN, -1, 7])).toEqual([-1, 7])
    expect(extent([])).toBeNull()
  })

  it('picks 1/2/5 steps, never exceeding the asked-for tick count', () => {
    // 10 across 4 ticks wants 2.5 → the next nice step UP (5), so 3 ticks, not 6.
    expect(niceStep(10, 4)).toBe(5)
    expect(niceStep(100, 4)).toBe(50)
    expect(niceStep(3, 4)).toBe(1)
    expect(niceStep(16, 4)).toBe(5)
  })

  it('extends outward to nice bounds and can pull the domain to zero', () => {
    expect(niceTicks(80.2, 82.9, 4)).toEqual([80, 81, 82, 83])
    expect(niceTicks(1200, 9800, 2, true)).toEqual([0, 5000, 10000])
  })

  it('still produces a band around a flat series', () => {
    const ticks = niceTicks(5, 5, 4)
    expect(ticks[0]).toBeLessThan(5)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(5)
  })
})

describe('formatting', () => {
  it('compacts thousands lowercase for ticks and keeps full values for labels', () => {
    expect(formatTick(10000)).toBe('10k')
    expect(formatTick(1500)).toBe('1.5k')
    expect(formatTick(-240)).toBe('-240')
    expect(formatValue(1150)).toBe('1,150')
  })
})
