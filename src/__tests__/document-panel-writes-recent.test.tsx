/**
 * KAN-390: `DocumentPanel` is the one owner of the ⌘K/@ recent-visits write —
 * every route that lands a page resolves through its `page` query, so this is
 * where the visit is recorded, scoped to the pond in context.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { PondContext } from '@/lib/pond/context'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/nested-page', () => ({
  ...jest.requireActual('@/lib/pages/nested-page'),
  markOpened: jest.fn().mockResolvedValue(undefined),
}))

const mockWriteRecent = jest.fn()
jest.mock('@/lib/pages/recent-pages', () => ({
  ...jest.requireActual('@/lib/pages/recent-pages'),
  writeRecent: (...args: unknown[]) => mockWriteRecent(...args),
}))

const PAGE = {
  id: 'page-1',
  title: 'projects',
  type: 'page',
  blocks: [],
  props: {},
}

function mount() {
  mockGetPage.mockResolvedValue(PAGE)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider
        value={{
          pond: { id: 'pond-1', name: 'life', glyph: null, theme: 'paper', order: 0 },
          ponds: [],
          loading: false,
          reload: () => {},
          addPond: () => {},
        }}
      >
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe('DocumentPanel records the recent visit once its page query resolves', () => {
  it('writes the resolved page as a recent, scoped to the pond in context', async () => {
    mount()

    await screen.findByLabelText('Page title')
    await waitFor(() => expect(mockWriteRecent).toHaveBeenCalledTimes(1))

    expect(mockWriteRecent).toHaveBeenCalledWith(
      { id: 'page-1', type: 'page', title: 'projects' },
      'pond-1'
    )
  })
})
