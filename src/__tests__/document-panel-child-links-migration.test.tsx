/**
 * KAN-415's one-time upgrade: a page saved before page-links existed gets
 * each of its CURRENT children appended as a page-link block, once, through
 * the editor's own `commitLocalEdit` — then its `childLinksMigrated` stamp
 * lands so a reload never re-runs it. Mocking follows
 * `document-panel-own-edit.test.tsx`.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PageRow } from '@/lib/pages/tree'

let mockNodeId = 'page-1'
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

let mockRows: PageRow[] = []
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(() => Promise.resolve(mockRows)),
  insertPageOptimistic: jest.fn(),
  applyPagePropsOptimistic: jest.fn(),
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

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const mockMarkChildLinksMigrated = jest.fn()
jest.mock('@/lib/pages/child-links', () => ({
  ...jest.requireActual('@/lib/pages/child-links'),
  markChildLinksMigrated: (...args: unknown[]) => mockMarkChildLinksMigrated(...args),
}))

const PAGES: Record<string, { id: string; title: string; blocks: Block[]; props: Record<string, unknown> }> = {}

function mount() {
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => PAGES[id])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const savedCall = (n: number) => {
  const [, , pageId, blocks] = mockCommitBlocks.mock.calls[n]
  return { pageId, blocks: blocks as Block[] }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  mockCommitBlocks.mockResolvedValue(undefined)
  mockMarkChildLinksMigrated.mockResolvedValue(undefined)
  mockRows = []
})

describe('DocumentPanel — the one-time child-links upgrade', () => {
  it('appends one page-link block per current child and stamps the migration', async () => {
    PAGES['page-1'] = { id: 'page-1', title: 'Workshop', blocks: [], props: {} }
    mockRows = [
      { id: 'child-a', parent_id: 'page-1', type: 'page', title: 'A', order: 1, updated_at: '2026-01-01' },
      { id: 'child-b', parent_id: 'page-1', type: 'page', title: 'B', order: 0, updated_at: '2026-01-01' },
    ]
    mount()

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(savedCall(0).pageId).toBe('page-1')
    expect(savedCall(0).blocks).toEqual([
      { id: expect.any(String), type: 'page-link', pageId: 'child-b' },
      { id: expect.any(String), type: 'page-link', pageId: 'child-a' },
    ])
    await waitFor(() => expect(mockMarkChildLinksMigrated).toHaveBeenCalledWith(expect.anything(), 'page-1'))
  })

  it('appends nothing for a child that already has a page-link block', async () => {
    PAGES['page-1'] = {
      id: 'page-1',
      title: 'Workshop',
      blocks: [{ id: 'b1', type: 'page-link', pageId: 'child-a' }],
      props: {},
    }
    mockRows = [
      { id: 'child-a', parent_id: 'page-1', type: 'page', title: 'A', order: 0, updated_at: '2026-01-01' },
    ]
    mount()

    await screen.findByText('A')
    await waitFor(() => expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1))
    expect(mockCommitBlocks).not.toHaveBeenCalled()
  })

  it('a page already stamped migrated is left alone, even with an unlinked child', async () => {
    PAGES['page-1'] = { id: 'page-1', title: 'Workshop', blocks: [], props: { childLinksMigrated: true } }
    mockRows = [
      { id: 'child-a', parent_id: 'page-1', type: 'page', title: 'A', order: 0, updated_at: '2026-01-01' },
    ]
    mount()

    await screen.findByDisplayValue('Workshop')
    await new Promise((r) => setTimeout(r, 50))
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()
  })
})
