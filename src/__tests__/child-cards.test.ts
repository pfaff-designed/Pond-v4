/**
 * The pure model behind a page's children grid — `childCards` over the flat
 * ['pages'] rows: card stats, nesting captions and recency.
 *
 * Counting rule (ticket-25, redefined by #108): a *content page* is a LEAF — a
 * page with no children. There is no `type = 'area'`; a page that holds pages
 * organises the pond and is never counted, while every leaf below it counts.
 * Where direct children and deeper descendants differ, the caption says so
 * explicitly ("2 pages · 1 nested").
 *
 * `parentId = null` is the root page, Life (#234): its children are the
 * top-level pages, minus the `databases` root (#101; 3c's second root).
 */

import { childCards } from '@/lib/pages/child-cards'
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

describe('childCards — a card per direct child', () => {
  it('orders cards by `order`, then title', () => {
    expect(childCards(ROWS, 'health', NOW).map((c) => c.title)).toEqual([
      'Sleep',
      'Marathon Training',
    ])
  })

  it('card stats count content descendants; the caption reads flat when direct == total', () => {
    const marathon = childCards(ROWS, 'health', NOW)[1]
    expect(marathon.stat).toBe('1') // week-1
    // marathon has 1 direct content child (week-1), all of it direct → flat phrasing.
    // week-1 (2d ago) is fresher than marathon itself (6d ago) — subtree recency.
    expect(marathon.sub).toBe('1 page inside · updated 2d ago')
  })

  it('splits direct vs nested when they differ', () => {
    const health = childCards(ROWS, null, NOW).find((c) => c.title === 'Health')!
    expect(health.stat).toBe('2') // sleep + week-1 (Marathon Training is a container)
    expect(health.sub.startsWith('1 page · 1 nested')).toBe(true)
  })

  it('an empty child reads 0 pages inside', () => {
    const personal = childCards(ROWS, null, NOW).find((c) => c.title === 'Personal')!
    expect(personal.stat).toBe('0')
    expect(personal.sub.startsWith('0 pages inside')).toBe(true)
  })

  it('a childless parent has no cards', () => {
    expect(childCards(ROWS, 'personal', NOW)).toEqual([])
    expect(childCards([], null, NOW)).toEqual([])
  })

  it('children of one area share its accent (colored by top-level ancestor)', () => {
    const cards = childCards(ROWS, 'health', NOW)
    expect(new Set(cards.map((c) => c.accent)).size).toBe(1)
  })

  it('falls back to "Untitled" for a blank title', () => {
    const rows = [row('top', null, 'page', 'Top'), row('blank', 'top', 'page', '')]
    expect(childCards(rows, 'top', NOW)[0].title).toBe('Untitled')
  })

  it('a nested sub-area is never counted, but its content is', () => {
    // personal (area) ─ food (area) ─ recipes · personal ─ trips
    const rows = [
      row('personal', null, 'page', 'Personal'),
      row('food', 'personal', 'page', 'Food', 0),
      row('recipes', 'food', 'page', 'Recipes'),
      row('trips', 'personal', 'page', 'Trips', 1),
    ]
    // the food card counts recipes as its 1 direct content page
    const food = childCards(rows, 'personal', NOW).find((c) => c.id === 'food')!
    expect(food.stat).toBe('1')
    expect(food.sub.startsWith('1 page inside')).toBe(true)
  })
})

describe('recency — "updated …" reads coarse and calm', () => {
  const at = (iso: string) => [
    row('top', null, 'page', 'Top'),
    row('c', 'top', 'page', 'C', 0, iso),
  ]
  const sub = (iso: string) => childCards(at(iso), 'top', NOW)[0].sub

  it.each`
    iso                       | expected
    ${'2026-08-26T09:00:00Z'} | ${'0 pages inside · updated today'}
    ${'2026-08-25T09:00:00Z'} | ${'0 pages inside · updated yesterday'}
    ${'2026-08-20T09:00:00Z'} | ${'0 pages inside · updated 6d ago'}
    ${'2026-08-01T09:00:00Z'} | ${'0 pages inside · updated 3w ago'}
    ${'2026-05-01T09:00:00Z'} | ${'0 pages inside · updated 3mo ago'}
  `('$iso → "$expected"', ({ iso, expected }) => {
    expect(sub(iso)).toBe(expected)
  })

  it('omits the recency for unparseable input', () => {
    expect(sub('not-a-date')).toBe('0 pages inside')
  })
})

// #108 — the counting rule itself, isolated: "a content page is a leaf". These
// pin the redefinition so a future change to `isContent` can't drift quietly.
describe('the content-page rule is leaf-ness, not a type tag (#108)', () => {
  it('a page stops being counted the moment it gains a child', () => {
    const leafOnly = [row('top', null, 'page', 'Top', 0), row('note', 'top', 'page', 'Note', 0)]
    expect(childCards(leafOnly, null, NOW)[0].stat).toBe('1') // note only

    const withGrandchild = [...leafOnly, row('deep', 'note', 'page', 'Deep', 0)]
    // Note is now a container too → the only leaf left is Deep.
    expect(childCards(withGrandchild, null, NOW)[0].stat).toBe('1')
    expect(childCards(withGrandchild, 'top', NOW)[0].stat).toBe('1')
  })

  it('never reads a type tag: a childless project counts, a project with children does not', () => {
    const rows = [
      row('top', null, 'page', 'Top', 0),
      row('p1', 'top', 'project', 'Solo project', 0),
      row('p2', 'top', 'project', 'Parent project', 1),
      row('step', 'p2', 'action', 'Step one', 0),
    ]
    // Solo project (leaf) + Step one (leaf) = 2. Parent project is a container.
    expect(childCards(rows, null, NOW)[0].stat).toBe('2')
    const cards = childCards(rows, 'top', NOW)
    expect(cards.find((c) => c.id === 'p1')!.stat).toBe('0')
    expect(cards.find((c) => c.id === 'p2')!.stat).toBe('1')
  })

  it('counts leaves at any depth, not just direct children', () => {
    const deep = [
      row('a', null, 'page', 'A', 0),
      row('b', 'a', 'page', 'B', 0),
      row('c', 'b', 'page', 'C', 0),
      row('d', 'c', 'page', 'D', 0),
    ]
    // Only D is a leaf, four levels down.
    expect(childCards(deep, null, NOW)[0].stat).toBe('1')
    expect(childCards(deep, 'a', NOW)[0].sub.startsWith('0 pages · 1 nested')).toBe(true)
  })
})

// #234 — Life is a page: its children are the top-level pages.
describe('the root page (parentId = null)', () => {
  it('lists every top-level page as a card', () => {
    expect(childCards(ROWS, null, NOW).map((c) => c.title)).toEqual([
      'Health',
      'Personal',
      'Scratchpad',
    ])
  })

  // #101: the `databases` root is the pond's SECOND root (3c, "one root beside
  // life"), which the rail lifts out of the Life tree. The root page's children
  // have to agree — otherwise the same page is a root on one surface and a child
  // on another.
  it('leaves the databases root and its databases out of Life entirely', () => {
    const rows = [
      ...ROWS,
      row('root-db', null, 'page', 'databases', 3),
      row('db-1', 'root-db', 'page', 'ingredients', 0),
      row('db-2', 'root-db', 'page', 'kitchen costs', 1),
    ]
    expect(childCards(rows, null, NOW).map((c) => c.title)).toEqual([
      'Health',
      'Personal',
      'Scratchpad',
    ])
  })

  it('still lists the databases when the databases root itself is opened', () => {
    const rows = [
      row('root-db', null, 'page', 'databases', 0),
      row('db-1', 'root-db', 'page', 'ingredients', 0),
      row('db-2', 'root-db', 'page', 'kitchen costs', 1),
    ]
    expect(childCards(rows, 'root-db', NOW).map((c) => c.title)).toEqual([
      'ingredients',
      'kitchen costs',
    ])
  })

  it('does not mistake a NESTED page named "databases" for the root', () => {
    const rows = [
      row('health', null, 'page', 'Health', 0),
      row('fake', 'health', 'page', 'databases', 0),
    ]
    expect(childCards(rows, 'health', NOW).map((c) => c.title)).toEqual(['databases'])
  })
})
