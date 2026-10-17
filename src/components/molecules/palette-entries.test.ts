/**
 * `rankPages`'s scoring (KAN-390): each tier in isolation, the visit boost's
 * magnitude at a few recency positions, the depth tiebreak, a diacritic
 * match, and a zero-score item dropped.
 */

import { paletteEntries, rankPages, type PaletteItem } from './palette-entries'

const page = (id: string, label: string, path: readonly string[] = []): PaletteItem => ({
  id,
  label,
  kind: 'page',
  path,
})

describe('rankPages tiers', () => {
  it('ranks an exact match above a prefix match', () => {
    const items = [page('a', 'pro'), page('b', 'projects')]
    const ranked = rankPages(items, 'pro')
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('ranks a prefix match above a word-start match', () => {
    const items = [page('a', 'new project'), page('b', 'projects')]
    const ranked = rankPages(items, 'pro')
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('ranks a word-start match above a mid-word substring match', () => {
    const items = [page('a', 'improvements'), page('b', 'new project')]
    const ranked = rankPages(items, 'pro')
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it("ranks a prefix match ('Projects') above a mid-word substring match ('Improvements')", () => {
    const items = [page('a', 'Improvements'), page('b', 'Projects')]
    const ranked = rankPages(items, 'pro')
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('ranks a contiguous substring match above a scattered subsequence match', () => {
    // "sub" sits mid-word in "absubtle" (substring); "sauce bun" only scatter-matches s-u-b.
    const items = [page('a', 'sauce bun'), page('b', 'absubtle')]
    const ranked = rankPages(items, 'sub')
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('finds "new page" for "nwp" by subsequence', () => {
    const items = [page('a', 'new page')]
    const ranked = rankPages(items, 'nwp')
    expect(ranked.map((i) => i.id)).toEqual(['a'])
  })

  it('drops a zero-score item entirely', () => {
    const items = [page('a', 'new page'), page('b', 'projects')]
    const ranked = rankPages(items, 'zzz')
    expect(ranked).toEqual([])
  })
})

describe('rankPages visit boost', () => {
  it('scales down from the newest visit to the oldest', () => {
    const items = [page('a', 'projects'), page('b', 'projects of mine'), page('c', 'projects too')]
    const visits = ['a', 'b', 'c']
    const ranked = rankPages(items, 'projects', visits)
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('adds the full boost at the newest position and a smaller one further back', () => {
    const items = [page('a', 'projects'), page('b', 'projects')]
    // Both tie on tier alone; "b" at the newest visit position outranks "a" further back.
    const ranked = rankPages(items, 'projects', ['b', 'x', 'x', 'a'])
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('gives no boost to an item absent from visits', () => {
    const items = [page('a', 'projects'), page('b', 'projects')]
    const ranked = rankPages(items, 'projects', ['b'])
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('rankPages depth tiebreak', () => {
  it('ranks a shallower page above a deeper one on an otherwise full tie', () => {
    const items = [page('deep', 'projects', ['root', 'mid']), page('shallow', 'projects', ['root'])]
    const ranked = rankPages(items, 'projects')
    expect(ranked.map((i) => i.id)).toEqual(['shallow', 'deep'])
  })
})

describe('rankPages stability', () => {
  it('keeps the input order on a full tie', () => {
    const items = [page('a', 'projects'), page('b', 'projects'), page('c', 'projects')]
    const ranked = rankPages(items, 'projects')
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('paletteEntries wires rankPages into pages and actions (KAN-390)', () => {
  it('ranks "Projects" above "Improvements" for "pro" — tree order would list them the other way', () => {
    const items = [page('a', 'Improvements'), page('b', 'Projects')]
    const entries = paletteEntries(items, 'pro')
    const pagesGroup = entries.indexOf(entries.find((e) => e.kind === 'group' && e.label === 'pages')!)
    const actionsGroup = entries.findIndex((e) => e.kind === 'group' && e.label === 'actions')
    const pages = entries
      .slice(pagesGroup + 1, actionsGroup)
      .flatMap((e) => (e.kind === 'row' ? [e.item.id] : []))
    expect(pages).toEqual(['b', 'a'])
  })

  it('lists "new page" under actions for "nwp" via the subsequence tier', () => {
    const items = [
      page('a', 'Improvements'),
      { id: 'new-page', label: 'new page', kind: 'action' } satisfies PaletteItem,
    ]
    const entries = paletteEntries(items, 'nwp')
    const groups = entries.flatMap((e) => (e.kind === 'group' ? [e.label] : []))
    expect(groups).toContain('actions')
    const actionsGroup = entries.indexOf(entries.find((e) => e.kind === 'group' && e.label === 'actions')!)
    const actionRows = entries
      .slice(actionsGroup + 1)
      .flatMap((e) => (e.kind === 'row' ? [e.item.id] : []))
    expect(actionRows).toContain('new-page')
  })
})

describe('rankPages diacritics', () => {
  it('matches "cafe" against "Café"', () => {
    const items = [page('a', 'Café')]
    const ranked = rankPages(items, 'cafe')
    expect(ranked.map((i) => i.id)).toEqual(['a'])
  })

  it('is case-insensitive', () => {
    const items = [page('a', 'Projects')]
    const ranked = rankPages(items, 'PRO')
    expect(ranked.map((i) => i.id)).toEqual(['a'])
  })
})
