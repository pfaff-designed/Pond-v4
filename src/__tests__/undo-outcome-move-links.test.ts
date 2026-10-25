/**
 * KAN-467: undoing or redoing a move must invalidate the OLD and NEW link
 * parents' `['page', id]` keys too, not just the moved page's own. Without
 * it, an open parent page's draft never rebases onto the database's restored
 * (or re-removed) link row, and the next keystroke's debounced save writes
 * the stale draft back over it — losing the undo for good.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { homeQueryKey } from '@/lib/pages/keys'
import type { HomePage } from '@/lib/pages/home'
import type { ChangeLogRecord, MoveSnapshot } from '@/lib/change-log/types'
import type { HistoryStep } from '@/lib/change-log/undo'

const step: HistoryStep = { pondId: 'pond-1', recordIds: ['move-1'] }

const moveSnapshot = (over: Partial<MoveSnapshot> = {}): MoveSnapshot => ({
  parentId: null,
  parentTitle: null,
  siblingOrder: [],
  ...over,
})

const record = (over: Partial<ChangeLogRecord> = {}): ChangeLogRecord => ({
  id: 'undo-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'undo',
  actor: 'you',
  targetPageId: 'c-1',
  targetBlockId: null,
  before: null,
  after: null,
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  statusAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const pageInvalidations = (invalidateQueries: jest.SpyInstance): unknown[] =>
  invalidateQueries.mock.calls
    .map(([arg]) => arg?.queryKey)
    .filter((key): key is readonly unknown[] => Array.isArray(key) && key[0] === 'page')
    .map((key) => key[1])

describe('applyUndoOutcome — undo/redo of a move invalidates both link parents', () => {
  it('invalidates the old and new link parents for an undo record', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [
          record({
            action: 'undo',
            // undo's `before` (= v_from = the move's own `after`): where the
            // link now stands, before being undone.
            before: moveSnapshot({ parentId: 'q-1' }),
            // undo's `after` (= v_to = the move's own `before`): where it is
            // going back to.
            after: moveSnapshot({ parentId: 'p-1' }),
          }),
        ],
        step,
      },
      queryClient
    )

    const pageIds = pageInvalidations(invalidateQueries)
    expect(pageIds).toContain('q-1')
    expect(pageIds).toContain('p-1')
  })

  it('invalidates the old and new link parents for a redo record', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'redo',
      {
        outcome: 'done',
        records: [
          record({
            action: 'redo',
            before: moveSnapshot({ parentId: 'p-1' }),
            after: moveSnapshot({ parentId: 'q-1' }),
          }),
        ],
        step,
      },
      queryClient
    )

    const pageIds = pageInvalidations(invalidateQueries)
    expect(pageIds).toContain('p-1')
    expect(pageIds).toContain('q-1')
  })

  it('resolves a null parentId to the cached home row, same as the SQL does', () => {
    const queryClient = new QueryClient()
    const home: HomePage = { id: 'home-1', title: 'Life', blocks: [] }
    queryClient.setQueryData(homeQueryKey('pond-1'), home)
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [
          record({
            action: 'undo',
            before: moveSnapshot({ parentId: null }),
            after: moveSnapshot({ parentId: 'q-1' }),
          }),
        ],
        step,
      },
      queryClient
    )

    const pageIds = pageInvalidations(invalidateQueries)
    expect(pageIds).toContain('home-1')
    expect(pageIds).toContain('q-1')
  })

  it('invalidates no page key beyond the target for a non-move record', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [record({ action: 'undo', targetPageId: 'c-1', before: null, after: null })],
        step,
      },
      queryClient
    )

    expect(pageInvalidations(invalidateQueries)).toEqual(['c-1'])
  })
})
