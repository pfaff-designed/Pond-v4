/**
 * The pure overview model behind the area/Life overview surfaces (shell
 * harvest slice 4/5): focal numerals, card stats, and recency captions derived
 * from the flat ['pages'] rows.
 *
 * Counting rule (ticket-25, redefined by #108): a *content page* is a LEAF — a
 * page with no children. There is no `type = 'area'` any more; a page that holds
 * pages IS the shell (a rail folder) and no headline count tallies it, while every
 * leaf below it counts. Where direct children and deeper descendants differ, the
 * CARD caption says so explicitly ("2 pages · 1 nested").
 *
 * Focal caption voice (ticket-33): the focal numeral stays the TOTAL content
 * pages; its caption speaks the breakdown like a person ("1 page, tucked in
 * Creativity." / "4 pages across your life, 3 of them in Health."). The phrasing
 * lives in `phraseFocalCaption`, table-tested below.
 */

import {
  areaOverview,
  lifeOverview,
  childCards,
  ancestorPath,
  insideLabel,
  phraseFocalCaption,
  timeAgo,
} from '@/lib/pages/overview'
import type { PageRow } from '@/lib/pages/tree'

const NOW = new Date('2026-08-26T12:00:00Z')

const row = (
  id: string,
  parent_id: string | null,
  type: string,
  title: string,
  order = 0,
  updated_at = '2026-08-26T09:00:00Z'
): PageRow => ({ id, parent_id, type, title, order, updated_at })

// health (container) ─ sleep · marathon (container) ─ marathon/week-1
// personal (top-level, empty → a LEAF under the #108 rule, so it counts as content)
// scratch (top-level leaf)
// Leaves — the content pages — are therefore: sleep, week-1, personal, scratch (4).
// Containers (never counted): health, marathon.
const ROWS: PageRow[] = [
  row('health', null, 'page', 'Health', 0),
  row('sleep', 'health', 'page', 'Sleep', 0, '2026-08-25T09:00:00Z'),
  row('marathon', 'health', 'project', 'Marathon Training', 1, '2026-08-20T09:00:00Z'),
  row('week-1', 'marathon', 'page', 'Week 1', 0, '2026-08-24T09:00:00Z'),
  row('personal', null, 'page', 'Personal', 1, '2026-08-01T09:00:00Z'),
  row('scratch', null, 'page', 'Scratchpad', 2),
]

describe('timeAgo', () => {
  it('reads coarse and calm', () => {
    expect(timeAgo('2026-08-26T09:00:00Z', NOW)).toBe('today')
    expect(timeAgo('2026-08-25T09:00:00Z', NOW)).toBe('yesterday')
    expect(timeAgo('2026-08-20T09:00:00Z', NOW)).toBe('6d ago')
    expect(timeAgo('2026-08-01T09:00:00Z', NOW)).toBe('3w ago')
    expect(timeAgo('2026-05-01T09:00:00Z', NOW)).toBe('3mo ago')
  })

  it('is empty for unparseable input', () => {
    expect(timeAgo('not-a-date', NOW)).toBe('')
  })
})

describe('insideLabel — the honest nesting phrase', () => {
  it('reads flat when all content is a direct child', () => {
    expect(insideLabel(3, 3)).toBe('3 pages inside')
    expect(insideLabel(1, 1)).toBe('1 page inside')
    expect(insideLabel(0, 0)).toBe('0 pages inside')
  })

  it('splits direct vs nested when they differ', () => {
    // 1 direct child, 1 more nested below it → "1 page · 1 nested"
    expect(insideLabel(1, 2)).toBe('1 page · 1 nested')
    expect(insideLabel(2, 5)).toBe('2 pages · 3 nested')
  })
})

describe('areaOverview', () => {
  it('counts only leaf content pages in the focal numeral, cards per direct child', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    // sleep + week-1. Marathon Training holds week-1, so it is a container, not
    // content — the #108 rule reads area-ness off the tree, not a type tag.
    expect(model.focal).toBe('2')
    // 1 direct (sleep), 1 more (week-1) tucked under Marathon Training.
    expect(model.focalCaption).toBe('2 pages within, 1 tucked deeper.')
    expect(model.cards.map((c) => c.title)).toEqual(['Sleep', 'Marathon Training'])
  })

  it('a flat area (all content direct) keeps the calm at-a-glance caption', () => {
    const flat = [
      row('area', null, 'page', 'Area'),
      row('a', 'area', 'page', 'A'),
      row('b', 'area', 'page', 'B'),
    ]
    const model = areaOverview(flat, 'area', NOW)
    expect(model.focal).toBe('2')
    expect(model.focalCaption).toBe('2 pages within.')
  })

  it('a single flat page reads the singular caption', () => {
    const one = [row('area', null, 'page', 'Area'), row('a', 'area', 'page', 'A')]
    expect(areaOverview(one, 'area', NOW).focalCaption).toBe('1 page within.')
  })

  it('card stats count content descendants; nested phrasing when direct != total', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    const marathon = model.cards[1]
    expect(marathon.stat).toBe('1') // week-1
    // marathon has 1 direct content child (week-1), all of it direct → flat phrasing.
    // week-1 (2d ago) is fresher than marathon itself (6d ago)
    expect(marathon.sub).toBe('1 page inside · updated 2d ago')
  })

  it('an empty area gets the quiet empty caption and no cards', () => {
    const model = areaOverview(ROWS, 'personal', NOW)
    expect(model.focal).toBe('0')
    expect(model.focalCaption).toBe('Nothing here yet.')
    expect(model.cards).toEqual([])
  })

  it('children of one area share its accent (colored by top-level ancestor)', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    expect(new Set(model.cards.map((c) => c.accent)).size).toBe(1)
  })

  it('a nested sub-area is never counted, but its content is', () => {
    // personal (area) ─ food (area) ─ recipes · personal ─ trips
    const rows = [
      row('personal', null, 'page', 'Personal'),
      row('food', 'personal', 'page', 'Food', 0),
      row('recipes', 'food', 'page', 'Recipes'),
      row('trips', 'personal', 'page', 'Trips', 1),
    ]
    const model = areaOverview(rows, 'personal', NOW)
    // recipes + trips; the food area itself is not a content page
    expect(model.focal).toBe('2')
    // 1 direct content child (trips — food is an area), recipes tucked deeper
    expect(model.focalCaption).toBe('2 pages within, 1 tucked deeper.')
    // the food card counts recipes as its 1 direct content page
    const food = childCards(rows, 'personal', NOW).find((c) => c.id === 'food')!
    expect(food.stat).toBe('1')
    expect(food.sub.startsWith('1 page inside')).toBe(true)
  })
})

// #108 — the counting rule itself, isolated: "a content page is a leaf". These
// pin the redefinition so a future change to `isContent` can't drift quietly.
describe('the content-page rule is leaf-ness, not a type tag (#108)', () => {
  it('a page stops being counted the moment it gains a child', () => {
    const leafOnly = [row('top', null, 'page', 'Top', 0), row('note', 'top', 'page', 'Note', 0)]
    expect(lifeOverview(leafOnly, NOW).focal).toBe('1') // note only; Top is a container

    const withGrandchild = [...leafOnly, row('deep', 'note', 'page', 'Deep', 0)]
    // Note is now a container too → the only leaf left is Deep.
    expect(lifeOverview(withGrandchild, NOW).focal).toBe('1')
    expect(areaOverview(withGrandchild, 'top', NOW).focal).toBe('1')
  })

  it('never reads a type tag: a childless project counts, a project with children does not', () => {
    const rows = [
      row('top', null, 'page', 'Top', 0),
      row('p1', 'top', 'project', 'Solo project', 0),
      row('p2', 'top', 'project', 'Parent project', 1),
      row('step', 'p2', 'action', 'Step one', 0),
    ]
    // Solo project (leaf) + Step one (leaf) = 2. Parent project is a container.
    expect(areaOverview(rows, 'top', NOW).focal).toBe('2')
    const cards = childCards(rows, 'top', NOW)
    expect(cards.find((c) => c.id === 'p1')!.stat).toBe('0')
    expect(cards.find((c) => c.id === 'p2')!.stat).toBe('1')
  })

  it('an empty top-level page is a leaf, so it counts as content until it fills', () => {
    const empty = [row('fresh', null, 'page', 'Fresh area', 0)]
    expect(lifeOverview(empty, NOW).focal).toBe('1')
    const filled = [...empty, row('first', 'fresh', 'page', 'First page', 0)]
    // Still 1 — but now it is the CHILD being counted, not the container.
    expect(lifeOverview(filled, NOW).focal).toBe('1')
    expect(lifeOverview(filled, NOW).cards.find((c) => c.id === 'fresh')!.stat).toBe('1')
  })

  it('counts leaves at any depth, not just direct children', () => {
    const deep = [
      row('a', null, 'page', 'A', 0),
      row('b', 'a', 'page', 'B', 0),
      row('c', 'b', 'page', 'C', 0),
      row('d', 'c', 'page', 'D', 0),
    ]
    // Only D is a leaf, four levels down.
    expect(areaOverview(deep, 'a', NOW).focal).toBe('1')
    expect(areaOverview(deep, 'a', NOW).focalCaption).toBe('1 page within.')
  })
})

describe('lifeOverview', () => {
  it('focal counts every CONTENT page — the leaves, containers excluded', () => {
    const model = lifeOverview(ROWS, NOW)
    // 6 rows − 2 containers (health, marathon) = 4 leaves
    expect(model.focal).toBe('4')
    // The focal 4 reads human; the caption names the concentration — Health holds
    // 2 of the 4 (sleep + week-1), a clear plurality.
    expect(model.focalCaption).toBe('4 pages across your life, 2 of them in Health.')
    expect(model.cards.map((c) => c.title)).toEqual(['Health', 'Personal', 'Scratchpad'])
  })

  it('the focal reconciles with the cards: total = top-level pages + Σ card stats', () => {
    // Focal semantics moved to total-with-breakdown-caption in ticket-33: the
    // focal is the TOTAL content pages, not the top-level count. The math still
    // reconciles, though — every content page is either top-level (its own card,
    // stat counting only what's inside it) or nested inside exactly one card, so
    // total = (top-level content pages) + Σ card stats. This guards the focal
    // number itself; the human caption is table-tested separately.
    const model = lifeOverview(ROWS, NOW)
    const cardSum = model.cards.reduce((sum, c) => sum + Number(c.stat), 0)
    expect(cardSum).toBe(2) // health 2 (sleep + week-1) + personal 0 + scratch 0
    const topLevelContentPages = 2 // personal + scratch (both childless → leaves)
    expect(Number(model.focal)).toBe(topLevelContentPages + cardSum)
  })

  it('the Health card counts its leaves only: 1 direct · 1 nested', () => {
    const model = lifeOverview(ROWS, NOW)
    const health = model.cards.find((c) => c.title === 'Health')!
    expect(health.stat).toBe('2') // sleep + week-1 (Marathon Training is a container)
    expect(health.sub.startsWith('1 page · 1 nested')).toBe(true)
  })

  it('the empty Personal area card reads 0 pages inside', () => {
    const model = lifeOverview(ROWS, NOW)
    const personal = model.cards.find((c) => c.title === 'Personal')!
    expect(personal.stat).toBe('0')
    expect(personal.sub.startsWith('0 pages inside')).toBe(true)
  })

  it('an empty workspace gets the quiet empty caption', () => {
    const model = lifeOverview([], NOW)
    expect(model.focal).toBe('0')
    expect(model.focalCaption).toBe('Nothing here yet.')
    expect(model.cards).toEqual([])
  })

  it('a single top-level content page reads "right at the top"', () => {
    const one = [row('note', null, 'page', 'A note', 0)]
    const model = lifeOverview(one, NOW)
    expect(model.focal).toBe('1')
    expect(model.focalCaption).toBe('1 page, right at the top.')
  })

  it('a single page tucked in an area reads "tucked in <Area>" (audit finding 10)', () => {
    // The exact case the audit flagged: one page created inside Creativity read
    // "1 — 0 pages · 1 nested across your life." — now it reads like a person.
    const rows = [
      row('creativity', null, 'page', 'Creativity', 0),
      row('ceramics', 'creativity', 'page', 'Ceramics Studio Plan', 0),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('1')
    expect(model.focalCaption).toBe('1 page, tucked in Creativity.')
  })
})

describe('phraseFocalCaption — the human voice matrix (ticket-33)', () => {
  // The focal numeral stays the TOTAL; this engine speaks the breakdown like a
  // person. The table below IS the spec for the copy — one row per phrasing.
  // Life rows use `dominant` (direct is —); area rows use `direct` (dominant
  // is —) — matching the FocalPhrasing union.
  it.each`
    label                              | scope     | total | direct | dominant                            | expected
    ${'empty life'}                    | ${'life'} | ${0}  | ${0}   | ${null}                             | ${'Nothing here yet.'}
    ${'empty area'}                    | ${'area'} | ${0}  | ${0}   | ${null}                             | ${'Nothing here yet.'}
    ${'one page, top of life'}         | ${'life'} | ${1}  | ${0}   | ${null}                             | ${'1 page, right at the top.'}
    ${'one page, tucked in an area'}   | ${'life'} | ${1}  | ${0}   | ${{ name: 'Creativity', count: 1 }} | ${'1 page, tucked in Creativity.'}
    ${'many, one area dominates'}      | ${'life'} | ${4}  | ${0}   | ${{ name: 'Health', count: 3 }}     | ${'4 pages across your life, 3 of them in Health.'}
    ${'many, all in one area'}         | ${'life'} | ${4}  | ${0}   | ${{ name: 'Health', count: 4 }}     | ${'4 pages across your life, all in Health.'}
    ${'many, even spread (no leader)'} | ${'life'} | ${6}  | ${0}   | ${null}                             | ${'6 pages across your life.'}
    ${'one page in an area'}           | ${'area'} | ${1}  | ${1}   | ${null}                             | ${'1 page within.'}
    ${'flat area, all direct'}         | ${'area'} | ${3}  | ${3}   | ${null}                             | ${'3 pages within.'}
    ${'area with a page tucked deep'}  | ${'area'} | ${2}  | ${1}   | ${null}                             | ${'2 pages within, 1 tucked deeper.'}
    ${'area, several tucked deeper'}   | ${'area'} | ${5}  | ${2}   | ${null}                             | ${'5 pages within, 3 tucked deeper.'}
  `('$label → "$expected"', ({ scope, total, direct, dominant, expected }) => {
    const input =
      scope === 'life'
        ? { scope: 'life' as const, total, dominant }
        : { scope: 'area' as const, total, direct }
    expect(phraseFocalCaption(input)).toBe(expected)
  })

  it('a lone page with no area at all stays plain ("right at the top")', () => {
    expect(phraseFocalCaption({ scope: 'life', total: 1, dominant: null })).toBe(
      '1 page, right at the top.'
    )
  })
})

describe('lifeOverview — dominant-area resolution feeds the caption', () => {
  it('names no leader when two areas hold equal content (even spread)', () => {
    // health: sleep + walk (2) · personal: trips + recipes (2) — a tie.
    const rows = [
      row('health', null, 'page', 'Health', 0),
      row('sleep', 'health', 'page', 'Sleep', 0),
      row('walk', 'health', 'page', 'Walking', 1),
      row('personal', null, 'page', 'Personal', 1),
      row('trips', 'personal', 'page', 'Trips', 0),
      row('recipes', 'personal', 'page', 'Recipes', 1),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('4')
    expect(model.focalCaption).toBe('4 pages across your life.')
  })

  it('does not crown a single-page lead among many top-level pages', () => {
    // 3 top-level leaves + Creativity holding just 1 → no real concentration.
    const rows = [
      row('a', null, 'page', 'A', 0),
      row('b', null, 'page', 'B', 1),
      row('c', null, 'page', 'C', 2),
      row('creativity', null, 'page', 'Creativity', 3),
      row('ceramics', 'creativity', 'page', 'Ceramics', 0),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('4')
    // Creativity's 1 is not a plurality over the 3 top-level pages → plain total.
    expect(model.focalCaption).toBe('4 pages across your life.')
  })

  it('names the clear leader across many pages', () => {
    const rows = [
      row('health', null, 'page', 'Health', 0),
      row('sleep', 'health', 'page', 'Sleep', 0),
      row('walk', 'health', 'page', 'Walking', 1),
      row('run', 'health', 'page', 'Running', 2),
      row('personal', null, 'page', 'Personal', 1),
      row('trips', 'personal', 'page', 'Trips', 0),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('4')
    expect(model.focalCaption).toBe('4 pages across your life, 3 of them in Health.')
  })

  it('reads "all in <Area>" when every page lives in the one area', () => {
    // Health is the only container, and every leaf sits inside it. (#108: an
    // *empty* second top-level page could not be here — with no children it is a
    // leaf, so it would be content and the total would not be "all in Health".)
    const rows = [
      row('health', null, 'page', 'Health', 0),
      row('sleep', 'health', 'page', 'Sleep', 0),
      row('walk', 'health', 'page', 'Walking', 1),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('2')
    expect(model.focalCaption).toBe('2 pages across your life, all in Health.')
  })
})

describe('ancestorPath — the breadcrumb trail', () => {
  it('returns the chain from root down to (not including) the node', () => {
    const trail = ancestorPath(ROWS, 'week-1')
    expect(trail.map((c) => c.title)).toEqual(['Health', 'Marathon Training'])
    expect(trail.map((c) => c.id)).toEqual(['health', 'marathon'])
  })

  it('is empty for a top-level node (no ancestors)', () => {
    expect(ancestorPath(ROWS, 'health')).toEqual([])
    expect(ancestorPath(ROWS, 'scratch')).toEqual([])
  })

  it('is empty for an unknown id', () => {
    expect(ancestorPath(ROWS, 'nope')).toEqual([])
  })

  it('is cycle-guarded against malformed parent links', () => {
    const cyclic: PageRow[] = [row('a', 'b', 'page', 'A'), row('b', 'a', 'page', 'B')]
    // must terminate — the exact trail is unimportant, only that it doesn't hang
    expect(() => ancestorPath(cyclic, 'a')).not.toThrow()
  })
})
