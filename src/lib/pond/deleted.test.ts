import { pondGoesLabel } from './deleted'

const NOW = new Date('2026-10-25T12:00:00Z')

describe('pondGoesLabel', () => {
  const cases: Array<[string, string, string]> = [
    ['just deleted → the full window (30 left)', '2026-10-25T12:00:00Z', 'goes in 30 days'],
    ['one elapsed → 29 left', '2026-10-24T12:00:00Z', 'goes in 29 days'],
    ['mid-window → 15 elapsed, 15 left', '2026-10-10T12:00:00Z', 'goes in 15 days'],
    ['one day left, singular', '2026-09-26T12:00:00Z', 'goes in 1 day'],
    ['day of purge → 0 left, plural', '2026-09-25T12:00:00Z', 'goes in 0 days'],
    ['past purge → floored at 0, never negative', '2026-09-01T12:00:00Z', 'goes in 0 days'],
  ]

  it.each(cases)('%s', (_name, deletedAt, expected) => {
    expect(pondGoesLabel(deletedAt, NOW)).toBe(expected)
  })

  /** Local-calendar-day arithmetic (`daysBetween`, `log-page.ts`), never ms
   *  math, so the count holds across the US fall-back regardless of host TZ
   *  — same reasoning as `purgeDay`'s own DST cases (KAN-500). Oct 2 → Nov 1
   *  is 30 calendar days (Oct has 31) whether or not that span crosses a
   *  clock change. */
  it('holds across the US DST fall-back (Oct 2 → Nov 1, 2026)', () => {
    const now = new Date('2026-11-01T00:30:00')
    expect(pondGoesLabel('2026-10-02T00:30:00', now)).toBe('goes in 0 days')
  })
})
