/**
 * KAN-468 follow-up: undoing a duplicate must invalidate the link parent's
 * own `['page', id]` key too, not just the copy's. Without it, that parent's
 * open draft never rebases onto the removed link row, and the next
 * keystroke's debounced save writes the stale draft (still linking the
 * trashed copy) back over it.
 *
 * `change_log_step` (0030) undoes by swapping before/after, so the undo
 * record this applies to carries the duplicate's snapshot on its OWN
 * `before` (the original record's `after`), with `after` null (the
 * original's `before`) — these fixtures use that real shape, not the
 * original record's own before/after. Redo is not exercised here: a
 * `page`-kind record (which `duplicate_page` reuses) refuses redo outright
 * when `before` is null (0030, part 2b), so a redo never reaches this code.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import type { ChangeLogRecord, DuplicatePageSnapshot } from '@/lib/change-log/types'
import type { HistoryStep } from '@/lib/change-log/undo'

const step: HistoryStep = { pondId: 'pond-1', recordIds: ['dup-1'] }

const duplicateSnapshot = (over: Partial<DuplicatePageSnapshot> = {}): DuplicatePageSnapshot => ({
  pageId: 'copy-1',
  ...over,
})

const record = (over: Partial<ChangeLogRecord> = {}): ChangeLogRecord => ({
  id: 'undo-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'undo',
  actor: 'you',
  targetPageId: 'copy-1',
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

describe('applyUndoOutcome — undoing a duplicate invalidates its link parent', () => {
  it('invalidates the link parent for an undo record', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [
          record({
            action: 'undo',
            targetPageId: 'copy-1',
            before: duplicateSnapshot({ appendedLinkId: 'link-1', linkParentId: 'kitchen-1' }),
            after: null,
          }),
        ],
        step,
      },
      queryClient
    )

    expect(pageInvalidations(invalidateQueries)).toContain('kitchen-1')
  })

  it('invalidates no page key beyond the target when the duplicate appended no link', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [
          record({
            action: 'undo',
            targetPageId: 'copy-1',
            before: duplicateSnapshot(),
            after: null,
          }),
        ],
        step,
      },
      queryClient
    )

    expect(pageInvalidations(invalidateQueries)).toEqual(['copy-1'])
  })
})
