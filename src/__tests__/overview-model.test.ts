/**
 * The pure overview model behind the area/Life overview surfaces (shell
 * harvest slice 4/5): focal numerals, card stats, and recency captions derived
 * from the flat ['pages'] rows.
 *
 * Counting rule (ticket-25): a *content page* is any node whose type !== 'area'.
 * Areas are the shell (rail folders); every headline count excludes them. Where
 * direct children and deeper descendants differ, the CARD caption says so
 * explicitly ("2 pages · 1 nested").
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

// health (area) ─ sleep, marathon ─ marathon/week-1
// personal (area) ─ (empty)
// scratch (page, top-level leaf)
const ROWS: PageRow[] = [
  row('health', null, 'area', 'Health', 0),
  row('sleep', 'health', 'page', 'Sleep', 0, '2026-08-25T09:00:00Z'),
  row('marathon', 'health', 'project', 'Marathon Training', 1, '2026-08-20T09:00:00Z'),
  row('week-1', 'marathon', 'page', 'Week 1', 0, '2026-08-24T09:00:00Z'),
  row('personal', null, 'area', 'Personal', 1, '2026-08-01T09:00:00Z'),
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
  it('counts only content pages in the focal numeral (areas excluded), cards per direct child', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    expect(model.focal).toBe('3') // sleep + marathon + week-1 (all non-areas)
    // 2 direct (sleep, marathon), 1 more (week-1) nested deeper → the focal 3
    // reads human, and the caption names what's tucked below the visible cards.
    expect(model.focalCaption).toBe('3 pages within, 1 tucked deeper.')
    expect(model.cards.map((c) => c.title)).toEqual(['Sleep', 'Marathon Training'])
  })

  it('a flat area (all content direct) keeps the calm at-a-glance caption', () => {
    const flat = [
      row('area', null, 'area', 'Area'),
      row('a', 'area', 'page', 'A'),
      row('b', 'area', 'page', 'B'),
    ]
    const model = areaOverview(flat, 'area', NOW)
    expect(model.focal).toBe('2')
    expect(model.focalCaption).toBe('2 pages within.')
  })

  it('a single flat page reads the singular caption', () => {
    const one = [row('area', null, 'area', 'Area'), row('a', 'area', 'page', 'A')]
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
      row('personal', null, 'area', 'Personal'),
      row('food', 'personal', 'area', 'Food', 0),
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

describe('lifeOverview', () => {
  it('focal counts every CONTENT page (the two areas are excluded)', () => {
    const model = lifeOverview(ROWS, NOW)
    // 6 rows − 2 areas (health, personal) = 4 content pages
    expect(model.focal).toBe('4')
    // The focal 4 reads human; the caption names the concentration — Health holds
    // 3 of the 4 (sleep + marathon + week-1), a clear plurality.
    expect(model.focalCaption).toBe('4 pages across your life, 3 of them in Health.')
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
    expect(cardSum).toBe(3) // health 3 + personal 0 + scratch 0
    const topLevelContentPages = 1 // scratch (health + personal are areas)
    expect(Number(model.focal)).toBe(topLevelContentPages + cardSum)
  })

  it('the Health card counts its content only: 2 direct · 1 nested', () => {
    const model = lifeOverview(ROWS, NOW)
    const health = model.cards.find((c) => c.title === 'Health')!
    expect(health.stat).toBe('3') // sleep + marathon + week-1
    expect(health.sub.startsWith('2 pages · 1 nested')).toBe(true)
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
      row('creativity', null, 'area', 'Creativity', 0),
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
  it.each`
    label                              | scope     | total | direct | dominant                            | expected
    ${'empty life'}                    | ${'life'} | ${0}  | ${0}   | ${null}                             | ${'Nothing here yet.'}
    ${'empty area'}                    | ${'area'} | ${0}  | ${0}   | ${null}                             | ${'Nothing here yet.'}
    ${'one page, top of life'}         | ${'life'} | ${1}  | ${1}   | ${null}                             | ${'1 page, right at the top.'}
    ${'one page, tucked in an area'}   | ${'life'} | ${1}  | ${0}   | ${{ name: 'Creativity', count: 1 }} | ${'1 page, tucked in Creativity.'}
    ${'many, one area dominates'}      | ${'life'} | ${4}  | ${1}   | ${{ name: 'Health', count: 3 }}     | ${'4 pages across your life, 3 of them in Health.'}
    ${'many, even spread (no leader)'} | ${'life'} | ${6}  | ${2}   | ${null}                             | ${'6 pages across your life.'}
    ${'one page in an area'}           | ${'area'} | ${1}  | ${1}   | ${null}                             | ${'1 page within.'}
    ${'flat area, all direct'}         | ${'area'} | ${3}  | ${3}   | ${null}                             | ${'3 pages within.'}
    ${'area with a page tucked deep'}  | ${'area'} | ${2}  | ${1}   | ${null}                             | ${'2 pages within, 1 tucked deeper.'}
    ${'area, several tucked deeper'}   | ${'area'} | ${5}  | ${2}   | ${null}                             | ${'5 pages within, 3 tucked deeper.'}
  `('$label → "$expected"', ({ scope, total, direct, dominant, expected }) => {
    expect(phraseFocalCaption({ scope, total, direct, dominant })).toBe(expected)
  })

  it('a lone page with no area at all stays plain ("right at the top")', () => {
    expect(phraseFocalCaption({ scope: 'life', total: 1, direct: 1, dominant: null })).toBe(
      '1 page, right at the top.'
    )
  })
})

describe('lifeOverview — dominant-area resolution feeds the caption', () => {
  it('names no leader when two areas hold equal content (even spread)', () => {
    // health: sleep + walk (2) · personal: trips + recipes (2) — a tie.
    const rows = [
      row('health', null, 'area', 'Health', 0),
      row('sleep', 'health', 'page', 'Sleep', 0),
      row('walk', 'health', 'page', 'Walking', 1),
      row('personal', null, 'area', 'Personal', 1),
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
      row('creativity', null, 'area', 'Creativity', 3),
      row('ceramics', 'creativity', 'page', 'Ceramics', 0),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('4')
    // Creativity's 1 is not a plurality over the 3 top-level pages → plain total.
    expect(model.focalCaption).toBe('4 pages across your life.')
  })

  it('names the clear leader across many pages', () => {
    const rows = [
      row('health', null, 'area', 'Health', 0),
      row('sleep', 'health', 'page', 'Sleep', 0),
      row('walk', 'health', 'page', 'Walking', 1),
      row('run', 'health', 'page', 'Running', 2),
      row('personal', null, 'area', 'Personal', 1),
      row('trips', 'personal', 'page', 'Trips', 0),
    ]
    const model = lifeOverview(rows, NOW)
    expect(model.focal).toBe('4')
    expect(model.focalCaption).toBe('4 pages across your life, 3 of them in Health.')
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
