/**
 * KAN-495 — `queueFor`'s page-write queue is created ONCE, lazily, per page
 * id (the registry's own contract). Its writer must still use whichever
 * `pondId` is current when a write actually happens, not whichever `pondId`
 * was in scope on that first call: `DocumentPanel` passes `pondId: null`
 * while ponds are still loading, and a reload landing straight on `?nodeId`
 * touches this page's queue before that resolves — if the writer froze
 * `pondId` at queue-creation time, every write for the rest of the session
 * would skip `sessionUndo` (its `trackPending`/`remember` both no-op on a
 * null pond).
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

const heading: Block = { id: 'b1', type: 'text', content: 'heading' }
const added: Block = { id: 'b2', type: 'text', content: 'added' }

const PAGE: PondPage = {
  id: 'page-pondid',
  parentId: null,
  type: 'page',
  title: 'Untitled',
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
  mockCommitBlocks.mockClear()
})

describe('usePageDraft writer reads pondId at write time (KAN-495)', () => {
  it('a write made after pondId becomes known carries the real pond, not the null the queue first saw', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      ({ pondId }: { pondId: string | null }) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page: PAGE, pageId: PAGE.id, pondId, getSupabase })
      },
      { wrapper: wrapper(client), initialProps: { pondId: null as string | null } }
    )

    // Ponds are still loading on first mount — this is the render that
    // touches the page's queue for the very first time.
    rerender({ pondId: 'pond-1' })

    act(() => {
      void result.current.writeStructural([heading, added])
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks.mock.calls[0][4]).toMatchObject({ pondId: 'pond-1' })
  })
})
