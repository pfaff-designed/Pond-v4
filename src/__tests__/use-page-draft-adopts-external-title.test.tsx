/**
 * KAN-470 — an open page never adopted a title written elsewhere (a renaming
 * move, its undo/redo, a rail rename): the seeding effect's "same page, no
 * unsaved edits" adopt branch compared `{title, blocks}` against
 * `queue.head()` but only called `setBlocks`, never `setTitle`, so the
 * rendered title/breadcrumb kept the OLD title and the next typed save sent
 * that stale title into `updateTitle`, colliding with whatever now holds the
 * real one. The re-open branch had the matching gap: it only rebased a stale
 * queue head when BLOCKS differed, so a title-only external change while away
 * left `head().title` stale (the next write's `before` would be wrong, which
 * matters for undo).
 */

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import { getPageWriteQueue, resetPageWriteRegistry } from '@/lib/pages/page-flush'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'
import type { PageWriteState } from '@/lib/pages/commit'
import type { PageWriteQueue } from '@/lib/pages/page-write-queue'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const heading: Block = { id: 'b1', type: 'text', content: 'heading' }
const edited: Block = { id: 'b1', type: 'text', content: 'edited' }

const PAGE: PondPage = {
  id: 'page-470',
  parentId: null,
  type: 'page',
  title: 'Notes',
  blocks: [heading],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  mockUpdateTitle.mockClear()
  mockCommitBlocks.mockClear()
  resetPageWriteRegistry()
})

describe('usePageDraft adopts a title written elsewhere (KAN-470)', () => {
  it("a renaming move landing in the ['page', id] cache while saved updates the rendered title, and a following typed edit saves the NEW title", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['page', PAGE.id], PAGE)

    function usePageDraftHarness() {
      const getSupabase = useLazySupabase()
      const { data: page } = useQuery({
        queryKey: ['page', PAGE.id],
        queryFn: () => Promise.resolve(PAGE),
      })
      return usePageDraft({ page: page ?? null, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
    }

    const { result } = renderHook(() => usePageDraftHarness(), { wrapper: wrapper(client) })
    await waitFor(() => expect(result.current.viewTitle).toEqual('Notes'))
    await waitFor(() => expect(result.current.saved).toBe(true))

    // The rail's renaming move lands directly in the ['page', id] cache, the
    // same way `handleMove`'s invalidate/refetch does.
    act(() => {
      client.setQueryData(['page', PAGE.id], { ...PAGE, title: 'Notes 2' })
    })

    await waitFor(() => expect(result.current.viewTitle).toEqual('Notes 2'))

    act(() => {
      result.current.commitLocalEdit([edited])
    })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), {
      timeout: EDIT_PAUSE_MS + 1000,
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(mockUpdateTitle.mock.calls[0]).toContain('Notes 2')
    expect(mockUpdateTitle.mock.calls[0]).not.toContain('Notes')
  })

  it("a re-open where only the title changed while away rebases the queue's head to the new title", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const first = renderHook(
      () => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: PAGE, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client) }
    )
    first.unmount()

    // Away, the page is renamed (a rail rename, a move's rename) but its
    // blocks are untouched — nothing routes that write through this page's
    // queue, so its head would otherwise stay at the old title.
    const renamed: PondPage = { ...PAGE, title: 'Notes 2' }

    renderHook(
      () => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: renamed, pageId: renamed.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client) }
    )

    // The same queue instance `usePageDraft` created and rebased — the proof
    // that the rebase actually updated `head().title`, not just what's
    // rendered, is this direct read of the queue the hook shares with the
    // rest of the app (sessionUndo's `before`, a later write's `before`).
    const queue = getPageWriteQueue<PageWriteQueue<PageWriteState>>(renamed.id, () => {
      throw new Error('usePageDraft should already have created this page’s queue')
    })
    expect(queue.head().title).toEqual('Notes 2')
  })
})
