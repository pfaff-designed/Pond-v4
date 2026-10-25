/**
 * KAN-468 follow-up: `afterDuplicate` must invalidate the link parent's own
 * `['page', id]` key when `duplicatePage`'s RPC appended a page-link block to
 * it — otherwise that parent's open draft (e.g. "Kitchen", holding the new
 * link to "Recipes 2") never rebases onto the write until an unrelated
 * refetch, and its next keystroke's debounced save can write the stale draft
 * back over the appended link.
 */

import { QueryClient } from '@tanstack/react-query'
import { afterDuplicate } from '@/lib/pages/tree'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/change-log/session-undo', () => ({ sessionUndo: { remember: jest.fn() } }))

const record = (over: Partial<ChangeLogRecord> = {}): ChangeLogRecord => ({
  id: 'rec-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'duplicate_page',
  actor: 'you',
  targetPageId: 'copy-1',
  targetBlockId: null,
  before: null,
  after: { pageId: 'copy-1' },
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

describe('afterDuplicate — invalidates the appended link parent', () => {
  it('invalidates ["page", linkParentId] when the RPC appended a link', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    afterDuplicate(
      queryClient,
      record({ after: { pageId: 'copy-1', appendedLinkId: 'link-1', linkParentId: 'kitchen-1' } }),
      'pond-1'
    )

    expect(pageInvalidations(invalidateQueries)).toContain('kitchen-1')
  })

  it('invalidates no page key when the RPC appended no link', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')

    afterDuplicate(queryClient, record({ after: { pageId: 'copy-1' } }), 'pond-1')

    expect(pageInvalidations(invalidateQueries)).toEqual([])
  })
})
