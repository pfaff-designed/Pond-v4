import { gaugeHeight, gaugeRadius, halfRingPath, layoutGauge } from './gauge-layout'

describe('gauge geometry', () => {
  it('reproduces the mockup radius and height at card width', () => {
    expect(gaugeRadius(318)).toBe(92)
    expect(gaugeHeight(318)).toBe(150)
  })

  it('clamps the fraction and skips the progress path at zero', () => {
    expect(layoutGauge(23, 30, 318, 150).fraction).toBeCloseTo(23 / 30)
    expect(layoutGauge(40, 30, 318, 150).fraction).toBe(1)
    expect(layoutGauge(5, 0, 318, 150).fraction).toBe(0)
    expect(layoutGauge(0, 30, 318, 150).progress).toBe('')
  })

  it('draws the half ring from the left end over the top, matching the mockup path', () => {
    // The mockup track: M67,120 A92,92 0 0 1 251,120 L237,120 A78,78 0 0 0 81,120 Z
    const path = halfRingPath(159, 120, 92, 78, 1)
    expect(path).toMatch(/^M67,120 A92,92 0 0 1 251,120 L237,120 A78,78 0 0 0 81,120 Z$/)
    // 23 of 30 ends at (227.37, 58.44) on the outer radius.
    expect(halfRingPath(159, 120, 92, 78, 23 / 30)).toContain('227.369,58.44')
  })
})
