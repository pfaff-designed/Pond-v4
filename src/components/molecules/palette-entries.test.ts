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
    // "sub" sits mid-word in "absubtle" (substring); "snubby" only scatter-matches
    // s-u-b, within the subsequence tier's span bound and far enough from "sub" by
    // edit distance not to read as a near-miss spelling.
    const items = [page('a', 'snubby'), page('b', 'absubtle')]
    const ranked = rankPages(items, 'sub')
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('scores word-start on a non-Latin label (Cyrillic), not just a-z0-9 words', () => {
    // "запрос" only substring-matches "про" mid-word; "мои проекты" has "про"
    // at the start of its second word — the regression this guards is a word
    // split that treats every non-Latin letter as a separator, which would
    // have scored both the same (or neither) instead of ranking the word-
    // start label above the mid-word one.
    const items = [page('a', 'запрос'), page('b', 'мои проекты')]
    const ranked = rankPages(items, 'про')
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('finds "new page" for "nwp" by subsequence', () => {
    const items = [{ id: 'a', label: 'new page', kind: 'action' } satisfies PaletteItem]
    const ranked = rankPages(items, 'nwp')
    expect(ranked.map((i) => i.id)).toEqual(['a'])
  })

  it('does not count a too-scattered subsequence hit: span must stay within 2x the query length', () => {
    // "pasta" against "save page as template": the greedy p-a-s-t-a span stretches
    // across the whole label, well past 2x the 5-char query.
    const items = [{ id: 'a', label: 'save page as template', kind: 'action' } satisfies PaletteItem]
    const ranked = rankPages(items, 'pasta')
    expect(ranked).toEqual([])
  })

  it('does not count a page/record subsequence hit whose own word near-misses the query', () => {
    // "cabnet" against "cabinet plan": within span, but "cabinet" is one edit from
    // "cabnet" — that goes to `did you mean`, not a fuzzy hit (PondPicker.dc.html `empty`).
    const items = [page('a', 'cabinet plan')]
    const ranked = rankPages(items, 'cabnet')
    expect(ranked).toEqual([])
  })

  it('still counts an action subsequence hit even when a word near-misses the query', () => {
    // Actions are exempt from the near-miss suppression — only pages/records defer to
    // `did you mean`.
    const items = [{ id: 'a', label: 'cabinet', kind: 'action' } satisfies PaletteItem]
    const ranked = rankPages(items, 'cabnt')
    expect(ranked.map((i) => i.id)).toEqual(['a'])
  })

  it('anchors the subsequence span on the tightest window, not the first occurrence of q[0]', () => {
    // "Pond projects" + "prj": anchoring on "Pond"'s own p gives a span of 9
    // (over the 6-char cap) and would drop the hit; the tighter window
    // starting at "projects"' own p scores span 4, within the cap.
    const items = [page('a', 'Pond projects')]
    const ranked = rankPages(items, 'prj')
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

describe('rankPages edge cases (KAN-390 acceptance: try to break it)', () => {
  it('a one-character query still tiers exact, prefix and substring sanely', () => {
    const items = [page('a', 'p'), page('b', 'projects'), page('c', 'map')]
    const ranked = rankPages(items, 'p')
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('500 pages rank under a frame budget', () => {
    const items = Array.from({ length: 500 }, (_, i) => page(`id-${i}`, `page number ${i} of things`))
    const start = performance.now()
    rankPages(items, 'pro', items.slice(0, 20).map((i) => i.id))
    // A frame is ~16ms; this leaves generous headroom (html-security.test.ts's
    // own budgets are this generous) so the assertion catches a real
    // regression (an accidental O(n^2) pass) rather than CI jitter.
    expect(performance.now() - start).toBeLessThan(50)
  })
})

describe('paletteEntries end-to-end diacritics (KAN-390)', () => {
  it('finds "Café" for "cafe" through the full paletteEntries path, not just rankPages', () => {
    const items = [page('a', 'Café'), page('b', 'Other page')]
    const entries = paletteEntries(items, 'cafe')
    const rows = entries.flatMap((e) => (e.kind === 'row' ? [e.item.id] : []))
    expect(rows).toContain('a')
    expect(rows).not.toContain('b')
  })
})
