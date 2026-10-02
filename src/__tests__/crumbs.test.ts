/**
 * The breadcrumb trail — `ancestorPath` and `crumbTrail` over the flat ['pages']
 * rows (ticket-25; #101 review / ADR 0003: which ROOT the trail starts at).
 */

import { ancestorPath, crumbTrail } from '@/lib/pages/crumbs'
import type { PageRow } from '@/lib/pages/tree'

const row = (
  id: string,
  parent_id: string | null,
  type: string,
  title: string,
  order = 0,
  updated_at = '2026-08-26T09:00:00Z'
): PageRow => ({ id, parent_id, type, title, order, updated_at })

const ROWS: PageRow[] = [
  row('health', null, 'page', 'Health', 0),
  row('sleep', 'health', 'page', 'Sleep', 0),
  row('marathon', 'health', 'project', 'Marathon Training', 1),
  row('week-1', 'marathon', 'page', 'Week 1', 0),
  row('personal', null, 'page', 'Personal', 1),
  row('scratch', null, 'page', 'Scratchpad', 2),
]

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

  it('falls back to "Untitled" for a blank ancestor title', () => {
    const rows = [row('top', null, 'page', ''), row('leaf', 'top', 'page', 'Leaf')]
    expect(ancestorPath(rows, 'leaf').map((c) => c.title)).toEqual(['Untitled'])
  })

  it('is cycle-guarded against malformed parent links', () => {
    const cyclic: PageRow[] = [row('a', 'b', 'page', 'A'), row('b', 'a', 'page', 'B')]
    // must terminate — the exact trail is unimportant, only that it doesn't hang
    expect(() => ancestorPath(cyclic, 'a')).not.toThrow()
  })
})

// ── crumbTrail — which root the trail starts at (#101 review / ADR 0003) ─────

describe('crumbTrail', () => {
  // 3c's two roots: life for reading, databases for data. A page under databases
  // must not read as though it were inside life.
  const DB_ROWS: PageRow[] = [
    ...ROWS,
    row('root-db', null, 'page', 'databases', 3),
    row('db-1', 'root-db', 'page', 'ingredients', 0),
    row('db-nested', 'db-1', 'page', 'archive', 0),
  ]

  it('starts a page under databases AT databases, with no life ahead of it', () => {
    const trail = crumbTrail(DB_ROWS, 'db-1')
    expect(trail.root).toEqual({ id: 'root-db', type: 'page', title: 'databases' })
    expect(trail.crumbs).toEqual([])
  })

  it('keeps the rest of the chain below that root', () => {
    const trail = crumbTrail(DB_ROWS, 'db-nested')
    expect(trail.root!.title).toBe('databases')
    expect(trail.crumbs.map((c) => c.title)).toEqual(['ingredients'])
  })

  it('leaves a page under life on the life root (null), chain untouched', () => {
    const trail = crumbTrail(DB_ROWS, 'week-1')
    expect(trail.root).toBeNull()
    expect(trail.crumbs.map((c) => c.title)).toEqual(['Health', 'Marathon Training'])
  })

  it('makes the databases root page its OWN trail root, so it reads just "databases"', () => {
    expect(crumbTrail(DB_ROWS, 'root-db')).toEqual({
      root: { id: 'root-db', type: 'page', title: 'databases' },
      crumbs: [],
    })
  })

  it('invents no third root when the ancestry reaches neither (a top-level page)', () => {
    expect(crumbTrail(DB_ROWS, 'health')).toEqual({ root: null, crumbs: [] })
    expect(crumbTrail(DB_ROWS, 'nope')).toEqual({ root: null, crumbs: [] })
  })

  it('resolves the root page (no node) to the empty life-rooted trail (#234)', () => {
    expect(crumbTrail(DB_ROWS, '')).toEqual({ root: null, crumbs: [] })
  })

  it('does not mistake a NESTED page named "databases" for the root', () => {
    const rows: PageRow[] = [
      row('health', null, 'page', 'Health', 0),
      row('fake', 'health', 'page', 'databases', 0),
      row('under', 'fake', 'page', 'A page', 0),
    ]
    const trail = crumbTrail(rows, 'under')
    expect(trail.root).toBeNull()
    expect(trail.crumbs.map((c) => c.title)).toEqual(['Health', 'databases'])
  })
})
