/**
 * The trash page's own view model — src/lib/change-log/trash-view.ts.
 *
 * What it pins: one row per subtree still in trash (restored and purged
 * subtrees left out, derived the same way `deleted-view.ts`'s own
 * in_trash/restored/emptied split works), and that `goes` reads as a plain
 * "in N days" string however close it is — never a signal to colour it
 * orange, since the model carries no such flag at all.
 */

import { buildTrashRows } from '@/lib/change-log/trash-view'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'

const NOW = new Date('2026-09-26T12:00:00.000Z')

const snapshot = (over: Partial<TrashSnapshot> = {}): TrashSnapshot => ({
  title: 'old quotes',
  parentId: 'parent-1',
  order: 0,
  pageIds: ['page-1'],
  blockCount: 4,
  nestedPageCount: 1,
  parentPath: ['creativity', 'kitchen renovation'],
  ...over,
})

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'delete',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: snapshot(),
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-08-27T12:00:00.000Z',
    statusAt: '2026-08-27T12:00:00.000Z',
    ...over,
  }
}

describe('buildTrashRows', () => {
  it('builds one row from a fresh delete still in trash', () => {
    const [row] = buildTrashRows([record()], new Map(), new Set(), 'life', NOW)

    expect(row.page).toBe('old quotes')
    expect(row.deletedBy).toBe('you')
    expect(row.record.id).toBe('rec-1')
  })

  it("reads `wasIn` as the live parent's CURRENT title when the parent is still in the pond", () => {
    const pageTitleById = new Map([['parent-1', 'kitchen renovation v2']])
    const [row] = buildTrashRows([record()], pageTitleById, new Set(), 'life', NOW)

    expect(row.wasIn).toBe('kitchen renovation v2')
  })

  it('falls back to the frozen parent name when the parent is no longer live', () => {
    const [row] = buildTrashRows([record()], new Map(), new Set(), 'life', NOW)

    expect(row.wasIn).toBe('kitchen renovation')
  })

  it("reads `wasIn` as rootLabel for a page that was already at the pond root", () => {
    const [row] = buildTrashRows(
      [record({ before: snapshot({ parentId: null, parentPath: [] }) })],
      new Map(),
      new Set(),
      'life',
      NOW
    )

    expect(row.wasIn).toBe('life')
  })

  it('excludes a subtree once a later restore record answers its delete', () => {
    const deleteRecord = record({ id: 'rec-1', createdAt: '2026-08-27T12:00:00.000Z' })
    const restoreRecord = record({
      id: 'rec-2',
      action: 'restore',
      createdAt: '2026-08-28T09:00:00.000Z',
      before: null,
      after: snapshot(),
    })

    const rows = buildTrashRows([deleteRecord, restoreRecord], new Map(), new Set(), 'life', NOW)

    expect(rows).toEqual([])
  })

  it('excludes a subtree whose page id the purge job has already emptied', () => {
    const rows = buildTrashRows([record()], new Map(), new Set(['page-1']), 'life', NOW)

    expect(rows).toEqual([])
  })

  it('renders no row for a delete record with no parseable TrashSnapshot', () => {
    const rows = buildTrashRows([record({ before: null })], new Map(), new Set(), 'life', NOW)

    expect(rows).toEqual([])
  })

  it.each([
    ['30 days out, fresh', '2026-09-26T12:00:00.000Z', 'in 30 days'],
    ['exactly at the 3-day boundary', '2026-08-30T12:00:00.000Z', 'in 3 days'],
    ['exactly 1 day left', '2026-08-28T12:00:00.000Z', 'in 1 day'],
    ['0 days left — clamped to "today", never "in 0 days"', '2026-08-27T12:00:00.000Z', 'today'],
    ['overdue by 1 day — clamped to "today", never a negative count', '2026-08-26T12:00:00.000Z', 'today'],
  ])('reads `goes` as %s: %s -> %s', (_label, createdAt, expected) => {
    const [row] = buildTrashRows([record({ createdAt })], new Map(), new Set(), 'life', NOW)

    expect(row.goes).toBe(expected)
  })

  it('counts `goes` from the second delete when a page is deleted, restored, then deleted again', () => {
    const firstDelete = record({ id: 'rec-1', createdAt: '2026-08-01T12:00:00.000Z' })
    const restore = record({
      id: 'rec-2',
      action: 'restore',
      createdAt: '2026-08-05T12:00:00.000Z',
      before: null,
      after: snapshot(),
    })
    const secondDelete = record({ id: 'rec-3', createdAt: '2026-09-20T12:00:00.000Z' })

    const rows = buildTrashRows([firstDelete, restore, secondDelete], new Map(), new Set(), 'life', NOW)

    expect(rows).toHaveLength(1)
    expect(rows[0].record.id).toBe('rec-3')
    expect(rows[0].goes).toBe('in 24 days')
  })

  it('keeps `TrashRow` free of any colour/urgency field — "ink only" is structural, not a flag', () => {
    const [row] = buildTrashRows([record()], new Map(), new Set(), 'life', NOW)

    expect(Object.keys(row).sort()).toEqual(
      ['deletedAt', 'deletedBy', 'goes', 'page', 'record', 'wasIn'].sort()
    )
  })
})
