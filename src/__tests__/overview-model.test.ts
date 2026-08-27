/**
 * The pure overview model behind the area/Life overview surfaces (shell
 * harvest slice 4/5): focal numerals, card stats, and recency captions derived
 * from the flat ['pages'] rows.
 */

import { areaOverview, lifeOverview, timeAgo } from '@/lib/pages/overview'
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

describe('areaOverview', () => {
  it('counts the whole subtree in the focal numeral, cards per direct child', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    expect(model.focal).toBe('3') // sleep + marathon + week-1
    expect(model.focalCaption).toBe('pages within, at a glance.')
    expect(model.cards.map((c) => c.title)).toEqual(['Sleep', 'Marathon Training'])
  })

  it('card stats count the child subtree; recency bubbles up from descendants', () => {
    const model = areaOverview(ROWS, 'health', NOW)
    const marathon = model.cards[1]
    expect(marathon.stat).toBe('1') // week-1
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
})

describe('lifeOverview', () => {
  it('focal counts every page; a card per top-level page (areas and leaves)', () => {
    const model = lifeOverview(ROWS, NOW)
    expect(model.focal).toBe('6')
    expect(model.focalCaption).toBe('pages across your life.')
    expect(model.cards.map((c) => c.title)).toEqual(['Health', 'Personal', 'Scratchpad'])
  })

  it('an empty workspace gets the quiet empty caption', () => {
    const model = lifeOverview([], NOW)
    expect(model.focal).toBe('0')
    expect(model.focalCaption).toBe('nothing here yet — create a page, or ask Pond.')
    expect(model.cards).toEqual([])
  })
})
