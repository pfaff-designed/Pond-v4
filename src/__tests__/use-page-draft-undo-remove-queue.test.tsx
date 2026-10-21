/**
 * KAN-495 — the toast "undo" of a block removal (`undoRemove`) is itself a
 * structural write, not a typed save: it must land on the page's write
 * queue as its own `structural` op, same as `removeBlockAt`, not through
 * `scheduleSave`'s debounced `typed` path.
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

const mockWriter = jest.fn().mockResolvedValue(undefined)
const mockCreatePageWriter = jest.fn((..._args: unknown[]) => mockWriter)
jest.mock('@/lib/pages/commit', () => ({
  createPageWriter: (...args: unknown[]) => mockCreatePageWriter(...args),
}))

const heading: Block = { id: 'b1', type: 'text', content: 'heading' }
const removed: Block = { id: 'b2', type: 'text', content: 'removed' }

const PAGE: PondPage = {
  id: 'page-1',
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

function strictWrapper(client: QueryClient) {
  return function StrictWrapper({ children }: { children: React.ReactNode }) {
    return (
      <React.StrictMode>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </React.StrictMode>
    )
  }
}

function mountDraft(page: PondPage = PAGE, strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(
    () => {
      const getSupabase = useLazySupabase()
      return usePageDraft({ page, pageId: page.id, pondId: 'pond-1', getSupabase })
    },
    { wrapper: strict ? strictWrapper(client) : wrapper(client) }
  )
  return { result }
}

beforeEach(() => {
  mockWriter.mockClear()
  mockCreatePageWriter.mockClear()
})

describe('undoRemove routes through the page write queue (KAN-495)', () => {
  it('re-inserts the block via a structural op, not a typed save', async () => {
    const { result } = mountDraft()

    act(() => {
      result.current.undoRemove(1, removed)
    })

    expect(result.current.viewBlocks.map((b) => b.id)).toEqual(['b1', 'b2'])

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockWriter).toHaveBeenCalledTimes(1)
    expect(mockWriter.mock.calls[0][0]).toMatchObject({
      kind: 'structural',
      after: { blocks: [heading, removed] },
    })
  })

  it('under StrictMode, one toast Undo enqueues exactly one structural write', async () => {
    const page: PondPage = { ...PAGE, id: 'page-strict-undo-remove' }
    const { result } = mountDraft(page, true)

    act(() => {
      result.current.undoRemove(1, removed)
    })

    expect(result.current.viewBlocks.map((b) => b.id)).toEqual(['b1', 'b2'])

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockWriter).toHaveBeenCalledTimes(1)
    expect(mockWriter.mock.calls[0][0]).toMatchObject({
      kind: 'structural',
      after: { blocks: [heading, removed] },
    })
  })
})
