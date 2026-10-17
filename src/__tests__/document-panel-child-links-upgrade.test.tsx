/**
 * KAN-415 path test A, on the real page-hosting surface: a page saved before
 * page-links existed shows its three children as page-link rows, in rail
 * order, with no card grid — and a reload (the parent already carrying the
 * written blocks + the `childLinksMigrated` stamp) never re-appends. Mocking
 * harness copied from `document-panel-nested-page-path.test.tsx` and
 * `document-panel-child-links-migration.test.tsx` (KAN-415's own migration
 * unit tests, which assert on `commitBlocks`/`markChildLinksMigrated` call
 * args rather than the rendered DOM — this file is the DOM-level path test
 * those left uncovered).
 */

import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

const mockMarkChildLinksMigrated = jest.fn()
jest.mock('@/lib/pages/child-links', () => ({
  ...jest.requireActual('@/lib/pages/child-links'),
  markChildLinksMigrated: (...args: unknown[]) => mockMarkChildLinksMigrated(...args),
}))

type SeedPage = { id: string; title: string; blocks: Block[]; props: Record<string, unknown> }
const PAGES: Record<string, SeedPage> = {}

function mount() {
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => PAGES[id])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const linkRows = () =>
  [...document.querySelectorAll('[id^="block-"]')].filter((el) => el.querySelector('[aria-label^="Open "]'))

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  mockCommitBlocks.mockResolvedValue(undefined)
  mockMarkChildLinksMigrated.mockResolvedValue(undefined)
  mockRows = [
    { id: 'child-creative', parent_id: 'page-1', type: 'page', title: 'Creative', order: 0, updated_at: '2026-01-01' },
    { id: 'child-personal', parent_id: 'page-1', type: 'page', title: 'personal', order: 1, updated_at: '2026-01-01' },
    { id: 'child-professional', parent_id: 'page-1', type: 'page', title: 'professional', order: 2, updated_at: '2026-01-01' },
  ]
})

describe('a page with children, upgraded on load, shows page-link rows not a card grid (KAN-415 path test A)', () => {
  it('appends three page-link rows in rail order and stamps the migration', async () => {
    PAGES['page-1'] = { id: 'page-1', title: 'Workshop', blocks: [], props: {} }
    mount()

    await waitFor(() => expect(linkRows()).toHaveLength(3))
    expect(linkRows().map((row) => within(row as HTMLElement).getByText(/^Creative$|^personal$|^professional$/).textContent)).toEqual([
      'Creative',
      'personal',
      'professional',
    ])
    expect(screen.queryByText(/\d+ pages? inside/)).not.toBeInTheDocument()

    await waitFor(() => expect(mockMarkChildLinksMigrated).toHaveBeenCalledWith(expect.anything(), 'page-1'))
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1))
    const [, , writtenPageId, writtenBlocks] = mockCommitBlocks.mock.calls[0]
    expect(writtenPageId).toBe('page-1')
    expect(writtenBlocks).toEqual([
      { id: expect.any(String), type: 'page-link', pageId: 'child-creative' },
      { id: expect.any(String), type: 'page-link', pageId: 'child-personal' },
      { id: expect.any(String), type: 'page-link', pageId: 'child-professional' },
    ])

    cleanup()
    PAGES['page-1'] = {
      id: 'page-1',
      title: 'Workshop',
      blocks: writtenBlocks as Block[],
      props: { childLinksMigrated: true },
    }
    mount()

    await waitFor(() => expect(linkRows()).toHaveLength(3))
    await screen.findByText('Creative')
    await screen.findByText('personal')
    await screen.findByText('professional')
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
  })
})
