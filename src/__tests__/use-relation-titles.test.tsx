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

const mockGetPage = jest.fn()
const mockGetCollectionRows = jest.fn()
const mockListPages = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...a: unknown[]) => mockGetPage(...a),
  getCollectionRows: (...a: unknown[]) => mockGetCollectionRows(...a),
  listPages: (...a: unknown[]) => mockListPages(...a),
}))

const mockExistingPageIds = jest.fn()
jest.mock('@/lib/change-log/trash', () => ({
  existingPageIds: (...a: unknown[]) => mockExistingPageIds(...a),
}))

const mockListRecords = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  listRecords: (...a: unknown[]) => mockListRecords(...a),
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
  mockExistingPageIds.mockReset().mockResolvedValue(new Set())
  mockListRecords.mockReset().mockResolvedValue([])
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

describe('useRelationTitles — trashed vs gone', () => {
  it('an id with no live title but still in the trash resolves into trashedTitles, not titles', async () => {
    mockGetPage.mockImplementation((_sb: unknown, id: string) =>
      Promise.resolve(id === 'trashed' ? null : page(id, `Title ${id}`))
    )
    mockListPages.mockResolvedValue([])
    mockExistingPageIds.mockResolvedValue(new Set(['trashed']))
    mockListRecords.mockResolvedValue([
      {
        id: 'rec1',
        action: 'delete',
        before: {
          title: 'Trashed Page',
          parentId: null,
          order: 0,
          pageIds: ['trashed'],
          blockCount: 0,
          nestedPageCount: 0,
          parentPath: [],
        },
      },
    ])
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles(['trashed'], undefined), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.trashedTitles.get('trashed')).toBe('Trashed Page'))
    expect(result.current.titles.has('trashed')).toBe(false)
  })

  it('an id absent from both live data and the trash resolves into neither map', async () => {
    mockGetPage.mockResolvedValue(null)
    mockListPages.mockResolvedValue([])
    mockExistingPageIds.mockResolvedValue(new Set())
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles(['gone'], undefined), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(mockExistingPageIds).toHaveBeenCalled())
    expect(result.current.titles.has('gone')).toBe(false)
    expect(result.current.trashedTitles.has('gone')).toBe(false)
  })

  it('a live id whose page query is still pending fires no existingPageIds call', async () => {
    let resolveGetPage!: (p: PondPage) => void
    mockGetPage.mockImplementation(
      () =>
        new Promise<PondPage>((resolve) => {
          resolveGetPage = resolve
        })
    )
    mockListPages.mockResolvedValue([])
    const client = freshClient()
    const { result } = renderHook(() => useRelationTitles(['p1'], undefined), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(mockGetPage).toHaveBeenCalled())
    expect(mockExistingPageIds).not.toHaveBeenCalled()

    resolveGetPage(page('p1', 'Title p1'))
    await waitFor(() => expect(result.current.titles.get('p1')).toBe('Title p1'))
    expect(mockExistingPageIds).not.toHaveBeenCalled()
  })
})
