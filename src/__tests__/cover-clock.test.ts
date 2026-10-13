import { formatCoverClock, timezoneCity } from '@/lib/first-run/cover-clock'

describe('timezoneCity', () => {
  it('lowercases the zone’s last segment and swaps underscores for spaces', () => {
    expect(timezoneCity('America/New_York')).toBe('new york')
  })

  it('takes the last segment of a three-part zone', () => {
    expect(timezoneCity('America/Argentina/Buenos_Aires')).toBe('buenos aires')
  })

  it('lowercases a zone with no separator', () => {
    expect(timezoneCity('UTC')).toBe('utc')
  })
})

describe('formatCoverClock', () => {
  it('matches 6d f1’s shape', () => {
    const date = new Date(2026, 8, 22, 7, 12)
    expect(formatCoverClock(date)).toEqual({
      weekday: 'tuesday',
      dateLabel: '22 september',
      time: '07:12',
    })
  })

  it('zero-pads hours and minutes under 10', () => {
    const date = new Date(2026, 0, 1, 3, 5)
    expect(formatCoverClock(date).time).toBe('03:05')
  })
})
