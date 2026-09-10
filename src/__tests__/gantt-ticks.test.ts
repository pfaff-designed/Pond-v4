/**
 * `buildTicks` (#57) — the shared gantt/timeline axis-tick selector. Pure math,
 * so jest pins the collision rules directly: weekly baseline when the track is
 * unmeasured, thinning to a wider weekly multiple when the measured width would
 * make neighbouring labels collide (< MIN_TICK_SPACING_PX apart), and dropping
 * a trailing tick whose centred label would spill past the track's right edge.
 */
import { buildTicks, MIN_TICK_SPACING_PX, formatTick } from '@/lib/modules/view/gantt-shared'
import { epochDay } from '@/lib/modules/view/apply'

describe('buildTicks', () => {
  it('keeps the weekly baseline when the track is unmeasured (0px)', () => {
    const ticks = buildTicks('2026-09-01', 30, 0)
    expect(ticks.map((t) => t.iso)).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
    ])
    expect(ticks[0].left).toBe(0)
    expect(ticks[1].left).toBeCloseTo((7 / 30) * 100)
  })

  it('thins ticks on a narrow track so labels never sit closer than the spacing floor', () => {
    // A year squeezed into 300px: weekly ticks would be ~5.8px apart (52 labels
    // on top of each other). The step must widen until spacing clears the floor.
    const ticks = buildTicks('2026-01-05', 364, 300)
    expect(ticks.length).toBeLessThan(52)
    for (let i = 1; i < ticks.length; i++) {
      const gapPx = ((ticks[i].left - ticks[i - 1].left) / 100) * 300
      expect(gapPx).toBeGreaterThanOrEqual(MIN_TICK_SPACING_PX)
    }
  })

  it('thinned ticks stay on the weekly grid (steps are multiples of 7 days)', () => {
    const ticks = buildTicks('2026-01-05', 364, 300)
    for (let i = 1; i < ticks.length; i++) {
      const gapDays = epochDay(ticks[i].iso) - epochDay(ticks[i - 1].iso)
      expect(gapDays % 7).toBe(0)
    }
    // First tick is always the range start.
    expect(ticks[0]).toEqual({ iso: '2026-01-05', left: 0 })
  })

  it('does not thin when the track is wide enough for every weekly label', () => {
    // 30 days over 1000px: weekly spacing ≈ 233px, far above the floor.
    const ticks = buildTicks('2026-09-01', 30, 1000)
    expect(ticks.map((t) => t.iso)).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
    ])
  })

  it('drops a trailing tick whose centred label would spill past the right edge', () => {
    // 8 days over 100px: the day-7 tick sits at 87.5px — within half a label of
    // the edge, where its centred text would be cut off. It goes; day 0 stays.
    const ticks = buildTicks('2026-09-01', 8, 100)
    expect(ticks.map((t) => t.iso)).toEqual(['2026-09-01'])
  })

  it('handles a single-day range without looping or crashing', () => {
    const ticks = buildTicks('2026-09-01', 1, 500)
    expect(ticks).toEqual([{ iso: '2026-09-01', left: 0 }])
  })

  it('feeds formatTick the same ISO days the renderers label with', () => {
    const [first] = buildTicks('2026-09-01', 30, 0)
    expect(formatTick(first.iso)).toBe('Sep 1')
  })
})
