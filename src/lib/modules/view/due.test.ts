import { dueAtom, localDateIso } from './due'

const now = new Date(2026, 9, 5, 13, 0)

describe('localDateIso', () => {
  it('reads the date from local parts, never UTC', () => {
    // Built from local parts: whatever the machine's or CI's TZ is, this
    // Date's own year/month/day are 2026-09-30 and must read back as such.
    expect(localDateIso(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30')
    expect(localDateIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })
})

describe('dueAtom', () => {
  it('reads a date as a lowercase weekday and day', () => {
    expect(dueAtom('2026-10-23', now)).toEqual({ kind: 'date', label: 'fri 23' })
    expect(dueAtom('2026-09-01', now)).toEqual({ kind: 'date', label: 'tue 1' })
  })

  it('reads today as today, whatever the time part', () => {
    expect(dueAtom('2026-10-05', now)).toEqual({ kind: 'today' })
    expect(dueAtom('2026-10-05T09:30:00', now)).toEqual({ kind: 'today' })
  })

  it('returns null for a value that is not a date', () => {
    expect(dueAtom('', now)).toBeNull()
    expect(dueAtom('soon', now)).toBeNull()
  })
})
