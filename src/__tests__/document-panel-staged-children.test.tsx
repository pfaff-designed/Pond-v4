/**
 * KAN-310 gap 1 — a page mid-delete still shows in a page's child cards. The
 * rail stages a leaf for delete behind the undo grace window (`staged-ids.ts`,
 * KAN-300); the parent page's child cards must drop it at once too, with no
 * reload, and bring it back on undo. `DocumentPanel` now reads its rows
 * through `usePagesRows` instead of a raw `fetchPages` query, so this is the
 * one non-rail surface the ticket's acceptance criteria name.
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { stageId, unstageId } from '@/lib/deletion/staged-ids'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'parent-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => {
  const actual = jest.requireActual('@/lib/pages/tree')
  return { ...actual, fetchPages: (...args: unknown[]) => mockFetchPages(...args) }
})

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'parent-1', title: 'Life', blocks: [], props: {} })
  mockFetchPages.mockResolvedValue([
    {
      id: 'parent-1',
      parent_id: null,
      type: 'page',
      title: 'Life',
      order: 0,
      updated_at: '2026-10-14T00:00:00Z',
    },
    {
      id: 'child-1',
      parent_id: 'parent-1',
      type: 'page',
      title: 'Groceries',
      order: 0,
      updated_at: '2026-10-14T00:00:00Z',
    },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('DocumentPanel — a staged child drops from the grid at once', () => {
  it('stages, drops the card; unstages, the card returns — no reload either way', async () => {
    renderPanel()
    await screen.findByText('Groceries')
    const callsBeforeStaging = mockFetchPages.mock.calls.length

    act(() => stageId('child-1'))
    await waitFor(() => expect(screen.queryByText('Groceries')).toBeNull())
    expect(mockFetchPages).toHaveBeenCalledTimes(callsBeforeStaging)

    act(() => unstageId('child-1'))
    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument())
    expect(mockFetchPages).toHaveBeenCalledTimes(callsBeforeStaging)
  })
})
