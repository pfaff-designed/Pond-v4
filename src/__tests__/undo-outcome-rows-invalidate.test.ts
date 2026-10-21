/**
 * KAN-385: a `done` undo/redo outcome must invalidate every touched page's
 * `['rows', pageId]` query — otherwise a ⌘Z on a calendar drop reverts the
 * database row but the calendar/peek keep drawing the undone value until an
 * unrelated refetch. The undo/redo RPC's own records carry action `'undo'`
 * or `'redo'` (supabase/migrations/0021_undo_redo.sql), never `edit_row`, so
 * the invalidation can't filter by action — it has to fire for every
 * record's `targetPageId`.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { rowsKey } from '@/lib/modules/view/rows-key'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { HistoryStep } from '@/lib/change-log/undo'

const step: HistoryStep = { pondId: 'pond-1', recordIds: ['rec-1'] }

const record = (over: Partial<ChangeLogRecord> = {}): ChangeLogRecord => ({
  id: 'rec-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'undo',
  actor: 'you',
  targetPageId: 'collection-1',
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

describe('applyUndoOutcome — a done outcome invalidates its records’ rows keys', () => {
  it('invalidates the rows query for an undo record', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [record({ action: 'undo', targetPageId: 'collection-1' })],
        step,
      },
      queryClient
    )

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: rowsKey('collection-1') })
  })

  it('invalidates the rows query for a redo record', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'redo',
      {
        outcome: 'done',
        records: [record({ action: 'redo', targetPageId: 'collection-2' })],
        step,
      },
      queryClient
    )

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: rowsKey('collection-2') })
  })

  it('invalidates no rows key at all when the record has no target page', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      { outcome: 'done', records: [record({ action: 'undo', targetPageId: null })], step },
      queryClient
    )

    const rowsCalls = invalidateQueries.mock.calls.filter(
      ([arg]) => Array.isArray(arg?.queryKey) && arg.queryKey[0] === 'rows'
    )
    expect(rowsCalls).toHaveLength(0)
  })
})
