import { pondGoesLabel } from './deleted'

const NOW = new Date('2026-10-25T12:00:00Z')

describe('pondGoesLabel', () => {
  const cases: Array<[string, string, string]> = [
    ['just deleted → the full window', '2026-10-25T12:00:00Z', 'goes in 30 days'],
    ['mid-window → 15 elapsed, 15 left', '2026-10-10T12:00:00Z', 'goes in 15 days'],
    ['one day left, singular', '2026-09-26T12:00:00Z', 'goes in 1 day'],
    ['day of purge → 0 left, plural', '2026-09-25T12:00:00Z', 'goes in 0 days'],
    ['past purge → floored at 0, never negative', '2026-09-01T12:00:00Z', 'goes in 0 days'],
  ]

  it.each(cases)('%s', (_name, deletedAt, expected) => {
    expect(pondGoesLabel(deletedAt, NOW)).toBe(expected)
  })
})
