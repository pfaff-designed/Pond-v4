/**
 * KAN-477: opening a page with children but no link rows must derive the
 * page-link rows at READ time, writing nothing — the write-on-open upgrade
 * effect this replaces (KAN-415) is deleted from `DocumentPanel`. Harness
 * copied from `document-panel-child-links-upgrade.test.tsx`. Must fail on
 * `origin/main`, where the same open commits a `commitBlocks` + stamp.
 */

import React from 'react'
import { render, waitFor, within } from '@testing-library/react'
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
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
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

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: 'pond-1', name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: jest.fn(),
    redo: jest.fn(),
    undoHandle: jest.fn(),
    remember: () => {},
    rememberPending: () => ({}),
    markPendingFailed: () => {},
    subscribe: () => () => {},
    isTopUndo: () => true,
  },
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
  [...document.querySelectorAll('[id^="block-"]')].filter((el) =>
    el.querySelector('[aria-label^="Open "]')
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
  mockMarkChildLinksMigrated.mockResolvedValue(undefined)
  mockRows = [
    { id: 'child-a', parent_id: 'page-1', type: 'page', title: 'Creative', order: 0, updated_at: '2026-01-01' },
    { id: 'child-b', parent_id: 'page-1', type: 'page', title: 'personal', order: 1, updated_at: '2026-01-01' },
    { id: 'child-c', parent_id: 'page-1', type: 'page', title: 'professional', order: 2, updated_at: '2026-01-01' },
  ]
})

describe('opening a page with unlinked children derives their page-link rows without writing (KAN-477)', () => {
  it('renders the three rows, and neither a save nor the migration stamp ever fires', async () => {
    PAGES['page-1'] = { id: 'page-1', title: 'Workshop', blocks: [], props: {} }
    mount()

    await waitFor(() => expect(linkRows()).toHaveLength(3))
    expect(
      linkRows().map(
        (row) =>
          within(row as HTMLElement).getByText(/^Creative$|^personal$|^professional$/).textContent
      )
    ).toEqual(['Creative', 'personal', 'professional'])

    // Past the 600ms debounce — a derived-at-read render must never schedule
    // or land a save, unlike the deleted write-on-open upgrade effect.
    await new Promise((r) => setTimeout(r, 700))

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()
  })
})
