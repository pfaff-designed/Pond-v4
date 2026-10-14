/**
 * The change log's `deleted` view model — src/lib/change-log/deleted-view.ts.
 *
 * What it pins: s6o6's card fields (title, `actor · time`, `was in`, `held`,
 * the in-trash/emptied/restored split), restore offered only while in trash,
 * and that a `restore` record silences the `delete` it answers.
 *
 * Clock/date text is computed the same way `change-log-summary.test.ts` pins
 * `revert of <clock>` — through the platform's own formatter, not a literal
 * string — so these pass under any machine's local timezone.
 */

import { buildDeletedCards } from '@/lib/change-log/deleted-view'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'

const NOW = new Date('2026-09-26T12:00:00.000Z')

const clockOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const shortDateOf = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' }).toLowerCase()}`
}

const plus30Days = (iso: string): string => new Date(Date.parse(iso) + 30 * 86_400_000).toISOString()

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

describe('buildDeletedCards', () => {
  it("builds a card from the delete record's TrashSnapshot", () => {
    const [card] = buildDeletedCards([record()], NOW, new Set(), 'life')

    expect(card.title).toBe('old quotes')
    expect(card.wasIn).toBe('creativity › kitchen renovation')
    expect(card.held).toBe('4 blocks, 1 nested page')
  })

  it("reads yesterday's hour as `actor · yesterday HH:MM`, relative to now", () => {
    const createdAt = '2026-09-25T18:40:00.000Z'
    const [card] = buildDeletedCards([record({ actor: 'you', createdAt })], NOW, new Set(), 'life')

    expect(card.actorTime).toBe(`you · yesterday ${clockOf(createdAt)}`)
  })

  it('reads an older record as `actor · D mon`, no time', () => {
    const createdAt = '2026-08-12T12:00:00.000Z'
    const [card] = buildDeletedCards([record({ createdAt })], NOW, new Set(), 'life')

    expect(card.actorTime).toBe(`you · ${shortDateOf(createdAt)}`)
  })

  it('offers restore and reads "restorable until" 30 days out while still in trash', () => {
    const [card] = buildDeletedCards([record()], NOW, new Set(), 'life')

    expect(card.status).toEqual({
      kind: 'in_trash',
      restorableUntil: shortDateOf(plus30Days('2026-08-27T12:00:00.000Z')),
    })
    expect(card.restoreOffered).toBe(true)
  })

  it('reads as emptied, offering no restore, once its page id is gone', () => {
    const [card] = buildDeletedCards([record()], NOW, new Set(['page-1']), 'life')

    expect(card.status).toEqual({
      kind: 'emptied',
      emptiedOn: shortDateOf(plus30Days('2026-08-27T12:00:00.000Z')),
    })
    expect(card.restoreOffered).toBe(false)
  })

  it('reads as restored, offering no restore, once a later restore record answers it', () => {
    const deleteRecord = record({ id: 'rec-1', createdAt: '2026-08-27T12:00:00.000Z' })
    const restoreRecord = record({
      id: 'rec-2',
      action: 'restore',
      createdAt: '2026-08-28T09:00:00.000Z',
      before: null,
      after: snapshot(),
    })

    const [card] = buildDeletedCards([deleteRecord, restoreRecord], NOW, new Set(), 'life')

    expect(card.status).toEqual({ kind: 'restored', parentFallback: false })
    expect(card.restoreOffered).toBe(false)
  })

  it('reads the restore record\'s parentFallback when the original parent was gone', () => {
    const deleteRecord = record({ id: 'rec-1', createdAt: '2026-08-27T12:00:00.000Z' })
    const restoreRecord = record({
      id: 'rec-2',
      action: 'restore',
      createdAt: '2026-08-28T09:00:00.000Z',
      before: null,
      after: { ...snapshot(), parentFallback: true },
    })

    const [card] = buildDeletedCards([deleteRecord, restoreRecord], NOW, new Set(), 'life')

    expect(card.status).toEqual({ kind: 'restored', parentFallback: true })
  })

  it('does not pair a delete with an earlier restore of a different trashing', () => {
    const firstDelete = record({ id: 'rec-1', createdAt: '2026-07-01T12:00:00.000Z' })
    const firstRestore = record({
      id: 'rec-2',
      action: 'restore',
      createdAt: '2026-07-02T12:00:00.000Z',
      before: null,
      after: snapshot(),
    })
    const secondDelete = record({ id: 'rec-3', createdAt: '2026-08-27T12:00:00.000Z' })

    const cards = buildDeletedCards([firstDelete, firstRestore, secondDelete], NOW, new Set(), 'life')
    const byId = new Map(cards.map((c) => [c.record.id, c]))

    expect(byId.get('rec-1')?.status).toEqual({ kind: 'restored', parentFallback: false })
    expect(byId.get('rec-3')?.status).toEqual({
      kind: 'in_trash',
      restorableUntil: shortDateOf(plus30Days('2026-08-27T12:00:00.000Z')),
    })
  })

  it("reads `wasIn` as the caller's rootLabel for a page that was already at the pond root", () => {
    const [card] = buildDeletedCards(
      [record({ before: snapshot({ parentPath: [] }) })],
      NOW,
      new Set(),
      'life'
    )

    expect(card.wasIn).toBe('life')
  })

  it("passes the caller's rootLabel through verbatim, rather than a hard-coded word", () => {
    const [card] = buildDeletedCards(
      [record({ before: snapshot({ parentPath: [] }) })],
      NOW,
      new Set(),
      'the garden'
    )

    expect(card.wasIn).toBe('the garden')
  })

  it('leaves a non-empty `parentPath` unaffected by rootLabel', () => {
    const [card] = buildDeletedCards([record()], NOW, new Set(), 'the garden')

    expect(card.wasIn).toBe('creativity › kitchen renovation')
  })

  it('renders no card for a delete record with no parseable TrashSnapshot', () => {
    const cards = buildDeletedCards([record({ before: null })], NOW, new Set(), 'life')

    expect(cards).toEqual([])
  })

  it('ignores every record that is not a delete', () => {
    const cards = buildDeletedCards(
      [record({ action: 'edit', before: [], after: [] })],
      NOW,
      new Set(),
      'life'
    )

    expect(cards).toEqual([])
  })
})
