/**
 * Resolving the active pond (#312, #313).
 *
 * This file exists because of a bug the whole 2,944-test suite missed: after
 * creating a pond the URL named it before the shell's list contained it, and
 * `resolveActivePond` fell back to `ponds[0]`. So a brand-new pond resolved to
 * `life` and showed life's pages — the exact symptom, with every test green.
 *
 * The fallback is the dangerous part, so it is what these pin down.
 */

import { pondHref, resolveActivePond } from '@/lib/pond/active'

const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const NOISE = { id: 'p-noise', name: 'make noise', glyph: null, theme: 'ink', order: 1 }

describe('resolveActivePond', () => {
  it('picks the first pond when the URL names none', () => {
    // A person who has never switched lands in `life`, as before ponds existed.
    expect(resolveActivePond([LIFE, NOISE], null)).toBe(LIFE)
  })

  it('picks the pond the URL names', () => {
    expect(resolveActivePond([LIFE, NOISE], 'p-noise')).toBe(NOISE)
  })

  it('returns NULL for a named pond that is not in the list — never the first', () => {
    // THE BUG. A just-created pond is in the URL before the list refetches. Falling
    // back to `ponds[0]` meant the new pond silently became `life`, and every
    // pond-scoped query read life's rows.
    expect(resolveActivePond([LIFE, NOISE], 'p-brand-new')).toBeNull()
  })

  it('returns null when there are no ponds at all', () => {
    // Before migration 0018 the table does not exist and the list is empty; the
    // shell must behave as it did before ponds, not crash.
    expect(resolveActivePond([], null)).toBeNull()
    expect(resolveActivePond([], 'p-life')).toBeNull()
  })
})

describe('pondHref', () => {
  it('drops any page, because a page id means nothing in another pond', () => {
    expect(pondHref('p-noise')).toBe('/workspace?pond=p-noise')
  })

  it('encodes the id', () => {
    expect(pondHref('a b&c')).toBe('/workspace?pond=a%20b%26c')
  })
})
