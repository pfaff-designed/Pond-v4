/**
 * The pure overview model behind the area/Life overview surfaces (shell
 * harvest slice 4/5): focal numerals, card stats, and recency captions derived
 * from the flat ['pages'] rows.
 *
 * Counting rule (ticket-25): a *content page* is any node whose type !== 'area'.
 * Areas are the shell (rail folders); every headline count excludes them. Where
 * direct children and deeper descendants differ, the caption says so explicitly
 * ("2 pages · 1 nested").
 */

import {
  areaOverview,
  lifeOverview,
  childCards,
  ancestorPath,
  insideLabel,
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
    expect(model.focalCaption).toBe('pages within, at a glance.')
    expect(model.cards.map((c) => c.title)).toEqual(['Sleep', 'Marathon Training'])
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
    expect(model.focalCaption).toBe('nothing inside yet — add a page, or ask Pond.')
    expect(model.cards).toEqual([])
  })

  it('children of one area share its accent (colored by top-level ancestor)', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    expect(new Set(model.cards.map((c) => c.accent)).size).toBe(1)
  })

  it("an area's card in a parent reads the nested split", () => {
    // Health as a card would be: 2 direct content (sleep, marathon) + 1 nested (week-1)
    const cards = childCards(ROWS, 'health', NOW)
    const marathonCard = cards.find((c) => c.id === 'marathon')!
    expect(marathonCard.sub.startsWith('1 page inside')).toBe(true)
  })
})

describe('lifeOverview', () => {
  it('focal counts every CONTENT page (the two areas are excluded)', () => {
    const model = lifeOverview(ROWS, NOW)
    // 6 rows − 2 areas (health, personal) = 4 content pages
    expect(model.focal).toBe('4')
    expect(model.focalCaption).toBe('pages across your life.')
    expect(model.cards.map((c) => c.title)).toEqual(['Health', 'Personal', 'Scratchpad'])
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
    expect(model.focalCaption).toBe('nothing here yet — create a page, or ask Pond.')
    expect(model.cards).toEqual([])
  })

  it('a single content page reads the singular caption', () => {
    const one = [row('note', null, 'page', 'A note', 0)]
    const model = lifeOverview(one, NOW)
    expect(model.focal).toBe('1')
    expect(model.focalCaption).toBe('page across your life.')
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
