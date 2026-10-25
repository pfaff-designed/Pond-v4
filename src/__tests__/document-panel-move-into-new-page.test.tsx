/**
 * The block menu's `move into a new page` row, on the real page-hosting
 * surface (KAN-361): `DocumentPanel` mounts `BlockCanvas` the same way the
 * running app does, so this proves the row is actually wired there — not
 * just reachable through a harness that hands `BlockCanvas` a callback no
 * caller passes.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

let mockNodeId = 'page-1'
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/pages/title-focus', () => ({
  requestTitleFocus: jest.fn(),
  consumeTitleFocus: () => false,
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

const mockGetPage = jest.fn()
const mockCreatePage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  saveBlocks: jest.fn().mockResolvedValue(undefined),
  saveProps: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
  createPageWriter: jest.fn(() => jest.fn().mockResolvedValue(undefined)),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
}))

const NOW = new Date().toISOString()
const PARENT_ROW = {
  id: 'page-1',
  parent_id: null,
  type: 'page',
  title: 'kitchen renovation',
  order: 0,
  updated_at: NOW,
}

const blocks: Block[] = [{ id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }]

const PAGES: Record<string, { id: string; title: string; blocks: Block[] }> = {
  'page-1': { id: 'page-1', title: 'kitchen renovation', blocks },
}

let client: QueryClient

function renderPanel() {
  mockGetPage.mockImplementation(async (...args: unknown[]) => PAGES[args[1] as string])
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  mockFetchPages.mockResolvedValueOnce([PARENT_ROW]).mockImplementation(() => new Promise(() => {}))
  mockCreatePage.mockResolvedValue({
    id: 'child-page-1',
    parentId: 'page-1',
    type: 'page',
    title: 'Cabinets are the only open cost.',
    blocks: [],
    order: 0,
    props: {},
  })
})

describe('`move into a new page`, mounted the way DocumentPanel really mounts BlockCanvas (KAN-361)', () => {
  it('shows the row and, picked, moves the block into a new child page', async () => {
    const user = userEvent.setup()
    renderPanel()

    await screen.findByLabelText('Page title')
    fireEvent.contextMenu(document.getElementById('block-b-note')!)

    const menu = await screen.findByRole('menu', { name: /block menu/i })
    const group = within(menu).getByRole('group', { name: 'block' })
    await user.click(within(group).getByRole('menuitem', { name: 'move into a new page' }))

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    expect(mockCreatePage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ parentId: 'page-1', blocks: [blocks[0]] })
    )

    expect(document.getElementById('block-b-note')).not.toBeInTheDocument()
    const row = await screen.findByRole('link', { name: /open/i })
    expect(row).toBeInTheDocument()
  })
})
