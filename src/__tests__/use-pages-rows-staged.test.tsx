/**
 * `usePagesRows` (KAN-310 gap 1): a reader built on the shared `['pages']`
 * query drops a staged-for-delete id at once, with no refetch, and the row
 * reappears the instant it's unstaged.
 */
import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { usePagesRows } from '@/lib/pages/use-pages'
import { pagesKey } from '@/lib/pages/keys'
import { stageId, unstageId } from '@/lib/deletion/staged-ids'
import type { PageRow } from '@/lib/pages/tree'

jest.mock('@/lib/pages/tree', () => {
  const actual = jest.requireActual('@/lib/pages/tree')
  return { ...actual, fetchPages: jest.fn(() => new Promise(() => {})) }
})

function rowOf(id: string, title: string): PageRow {
  return { id, parent_id: null, type: 'page', title, order: 0, updated_at: '2026-10-14T00:00:00Z' }
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('usePagesRows — staged ids drop live, reappear on unstage', () => {
  it('a staged id already in the cache drops at once, then comes back on unstage', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const rows = [rowOf('parent-1', 'Life'), rowOf('child-1', 'Groceries')]
    client.setQueryData(pagesKey(null), rows)

    const { result } = renderHook(() => usePagesRows(null), { wrapper: wrapper(client) })

    expect(result.current.data.map((r) => r.id)).toEqual(['parent-1', 'child-1'])

    act(() => stageId('child-1'))
    expect(result.current.data.map((r) => r.id)).toEqual(['parent-1'])

    act(() => unstageId('child-1'))
    expect(result.current.data.map((r) => r.id)).toEqual(['parent-1', 'child-1'])
  })
})
