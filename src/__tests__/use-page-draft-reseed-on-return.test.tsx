/**
 * KAN-495 — a page's write queue survives navigate-away (by design: a save
 * still in flight finishes in its own queue). But that means a queue from an
 * earlier visit can also carry a STALE `head()` into a later visit: if the
 * page changed elsewhere while away (an accepted diff, a child-links page-
 * link insert, an undo from another page), none of that routes through this
 * page's queue, so its head never moved. On return, the seeding effect must
 * rebase an idle, stale queue to what the server now holds — otherwise the
 * next write's `before` is a state the store no longer holds.
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const original: Block = { id: 'b1', type: 'text', content: 'original' }
const mutatedElsewhere: Block = { id: 'b2', type: 'text', content: 'mutated elsewhere' }
const typed: Block = { id: 'b1', type: 'text', content: 'typed after returning' }

const PAGE: PondPage = {
  id: 'page-reseed',
  parentId: null,
  type: 'page',
  title: 'Untitled',
  blocks: [original],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  mockCommitBlocks.mockClear()
})

describe('usePageDraft re-seeds a stale queue on return (KAN-495)', () => {
  it("a page mutated elsewhere while away gets the next write's before set to the mutated blocks, not the stale pre-leave head", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // Visit X: the first mount creates the page's write queue with
    // `[original]` as its head. Nothing writes, so it stays idle.
    const first = renderHook(
      () => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: PAGE, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client) }
    )
    first.unmount()

    // Leave, and while away the page changes elsewhere — nothing routes that
    // write through this page's queue, so its head stays at `[original]`.
    const mutated: PondPage = { ...PAGE, blocks: [mutatedElsewhere] }

    // Return to X: a fresh mount, fed the now-mutated page.
    const { result } = renderHook(
      () => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: mutated, pageId: mutated.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client) }
    )

    act(() => {
      void result.current.writeStructural([typed])
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks.mock.calls[0][4]).toMatchObject({ before: [mutatedElsewhere] })
  })

  it('a halted queue left behind on navigate-away is not rebased on return — it stays halted, showing unsaved', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockCommitBlocks.mockRejectedValueOnce(new Error('save failed'))

    const first = renderHook(
      () => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: PAGE, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client) }
    )

    // Halt the queue before leaving: a write that fails.
    await act(async () => {
      void first.result.current.writeStructural([typed])
      await Promise.resolve()
      await Promise.resolve()
    })

    first.unmount()

    const mutated: PondPage = { ...PAGE, blocks: [mutatedElsewhere] }

    // Return: the seeding effect must not rebase a halted queue — that would
    // discard the still-pending halted op (typed work) silently.
    const { result } = renderHook(
      () => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: mutated, pageId: mutated.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client) }
    )

    expect(result.current.saved).toBe(false)
  })
})
