/**
 * Title-resolution seam for a relation value (#20 slice 5). `useRelationTitles`
 * turns linked page-ids into a partial id→title map (unresolved ids omitted →
 * the caller renders them as missing chips) and supplies the picker's candidates.
 *
 * Targeted: reuse the shared `['rows', targetId]` cache (the collection's rows).
 * Untargeted: resolve each id via the shared `['page', id]` cache, and offer a
 * global page list as candidates ("link any page").
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRelationTitles } from '@/lib/modules/view/use-relation-titles'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}))

jest.mock('@/lib/workspace/context', () => ({ useWorkspace: () => 'main' }))

const mockGetPage = jest.fn()
const mockGetCollectionRows = jest.fn()
const mockListPages = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...a: unknown[]) => mockGetPage(...a),
  getCollectionRows: (...a: unknown[]) => mockGetCollectionRows(...a),
  listPages: (...a: unknown[]) => mockListPages(...a),
}))

function page(id: string, title: string, type: PondPage['type'] = 'page'): PondPage {
  return { id, parentId: null, type, title, blocks: [], props: {}, order: 0 }
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  mockGetPage.mockReset()
  mockGetCollectionRows.mockReset()
  mockListPages.mockReset()
})

describe('useRelationTitles — targeted (collection rows)', () => {
  it('resolves titles from the target rows and exposes them as candidates', async () => {
    mockGetCollectionRows.mockResolvedValue([
      page('r1', 'Row One', 'row'),
      page('r2', 'Row Two', 'row'),
    ])
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles(['r1'], 'col'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.titles.get('r1')).toBe('Row One'))
    expect(result.current.candidates).toEqual([
      { id: 'r1', title: 'Row One' },
      { id: 'r2', title: 'Row Two' },
    ])
    // Targeted mode reads the rows, not per-id pages.
    expect(mockGetPage).not.toHaveBeenCalled()
  })

  it('omits an off-target id (not among the rows) → caller renders it missing', async () => {
    mockGetCollectionRows.mockResolvedValue([page('r1', 'Row One', 'row')])
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles(['r1', 'ghost'], 'col'), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.titles.get('r1')).toBe('Row One'))
    expect(result.current.titles.has('ghost')).toBe(false)
  })
})

describe('useRelationTitles — untargeted (per-id + global candidates)', () => {
  it('resolves each id via its own page and omits a deleted one', async () => {
    mockGetPage.mockImplementation((_sb: unknown, id: string) =>
      Promise.resolve(id === 'gone' ? null : page(id, `Title ${id}`))
    )
    mockListPages.mockResolvedValue([])
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles(['p1', 'gone'], undefined), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.titles.get('p1')).toBe('Title p1'))
    expect(result.current.titles.has('gone')).toBe(false)
    expect(mockGetCollectionRows).not.toHaveBeenCalled()
  })

  it('offers a global page list as candidates, excluding rows', async () => {
    mockGetPage.mockResolvedValue(null)
    mockListPages.mockResolvedValue([
      page('a', 'Alpha'),
      page('b', 'Beta'),
      page('r', 'A Row', 'row'),
    ])
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles([], undefined), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.candidates.length).toBe(2))
    expect(result.current.candidates).toEqual([
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Beta' },
    ])
  })
})
