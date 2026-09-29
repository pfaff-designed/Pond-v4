/**
 * Unit tests for the sibling-name uniqueness helper (#84). Pure logic — the DB
 * index and the client wiring are covered separately (schema-invariants.pglite,
 * pages-client).
 */

import { nextAvailableTitle, normalizeTitle, DuplicateTitleError } from './dedupe-title'

describe('normalizeTitle', () => {
  it('trims and lowercases', () => {
    expect(normalizeTitle('  Personal  ')).toBe('personal')
    expect(normalizeTitle('HEALTH')).toBe('health')
  })
})

describe('nextAvailableTitle', () => {
  it('returns the desired title unchanged when there is no collision', () => {
    expect(nextAvailableTitle('Personal', ['Health', 'Finances'])).toBe('Personal')
  })

  it('appends " 2" on an exact collision', () => {
    expect(nextAvailableTitle('Personal', ['Personal'])).toBe('Personal 2')
  })

  it('collides case-insensitively and after trimming', () => {
    expect(nextAvailableTitle('  personal ', ['PERSONAL'])).toBe('personal 2')
  })

  it('fills the next gap when " 2" is also taken', () => {
    expect(nextAvailableTitle('Personal', ['Personal', 'Personal 2'])).toBe('Personal 3')
  })

  it('falls back to "Untitled" (then suffixes) for an empty desired title', () => {
    expect(nextAvailableTitle('', [])).toBe('Untitled')
    expect(nextAvailableTitle('   ', ['Untitled'])).toBe('Untitled 2')
  })
})

describe('DuplicateTitleError', () => {
  it('is an Error carrying the offending title and a named type', () => {
    const err = new DuplicateTitleError('Personal')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DuplicateTitleError')
    expect(err.title).toBe('Personal')
    expect(err.message).toContain('Personal')
  })
})
