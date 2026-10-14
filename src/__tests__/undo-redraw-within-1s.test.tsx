/**
 * KAN-302 — a landed ⇧⌘Z (or ⌘Z) must redraw the open page's blocks AND the
 * ⌥⌘H "changes to this page" panel within the ~1s a person waits before
 * pressing the chord again, with no second press. Renders the real
 * `DocumentPanel` (its blocks AND its own ⌥⌘H panel, via `usePageChangesPanel`)
 * beside the real `ShellCommands` (the ⌘Z/⇧⌘Z listener), sharing one
 * QueryClient — the same seam `runUndoStep` invalidates through.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: 'pond-1', name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn(),
}))

const mockUndo = jest.fn()
const mockRedo = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: (...args: unknown[]) => mockUndo(...args),
    redo: (...args: unknown[]) => mockRedo(...args),
  },
}))

const mockListRecords = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  advanceStatus: jest.fn(),
}))

jest.mock('@/lib/change-log/revert', () => ({
  acceptRevert: jest.fn(),
  proposeRevert: jest.fn(),
}))

const PAGE_ID = 'home-1'

const page = (blocks: Block[]) => ({
  id: PAGE_ID,
  parentId: null,
  type: 'home' as const,
  title: 'Life',
  blocks,
  props: {},
  order: 0,
})

const record = (id: string, content: string): ChangeLogRecord => ({
  id,
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'edit',
  actor: 'pond',
  targetPageId: PAGE_ID,
  targetBlockId: null,
  before: [],
  after: [{ id: 'b1', type: 'text', content }],
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-10-13T09:31:00.000Z',
  statusAt: '2026-10-13T09:31:00.000Z',
})

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  onPlatform('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('a landed ⇧⌘Z redraws the open page and its ⌥⌘H panel within ~1s (KAN-302)', () => {
  it('shows the redone blocks and the redone change-log row after ONE ⇧⌘Z, with no second press', async () => {
    mockGetPage.mockResolvedValueOnce(page([{ id: 'b0', type: 'text', content: 'before redo' }]))
    mockListRecords.mockResolvedValueOnce([])
    mockRedo.mockResolvedValue({ outcome: 'done', records: [record('rec-1', 'after redo')] })

    renderShell()

    await screen.findByText('before redo')
    const pageColumn = within(screen.getByTestId('page-column'))

    // Open the "changes to this page" panel — it starts empty.
    fireEvent.keyDown(document.body, { key: 'h', altKey: true, metaKey: true, code: 'KeyH' })
    await screen.findByText('no changes to this page yet')

    // The next reads of both queries reflect what the redo just landed.
    mockGetPage.mockResolvedValueOnce(page([{ id: 'b1', type: 'text', content: 'after redo' }]))
    mockListRecords.mockResolvedValueOnce([record('rec-1', 'after redo')])

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(mockRedo).toHaveBeenCalledTimes(1))

    // Both must redraw from this ONE chord, inside waitFor's own ~1s window —
    // no second ⇧⌘Z, no re-opening the panel.
    await waitFor(() => expect(pageColumn.queryByText('before redo')).not.toBeInTheDocument())
    expect(pageColumn.getByText('after redo')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('no changes to this page yet')).not.toBeInTheDocument()
    )
  })

  // PATH_STEPS step 6, literally: accept a create diff (the block is on the
  // page already, as if just accepted) → ⌘Z removes it → ONE ⇧⌘Z puts it back,
  // panel included, inside one waitFor pass — no second press.
  it('a created block that ⌘Z removed is back on the page and in the panel after ONE ⇧⌘Z', async () => {
    const created: Block = { id: 'b-new', type: 'text', content: 'the new block' }
    mockGetPage.mockResolvedValueOnce(page([created]))
    mockListRecords.mockResolvedValueOnce([record('rec-1', 'the new block')])
    mockUndo.mockResolvedValue({
      outcome: 'done',
      records: [{ ...record('undo-1', 'the new block'), action: 'undo' }],
    })

    renderShell()
    await screen.findByText('the new block')
    const pageColumn = within(screen.getByTestId('page-column'))
    fireEvent.keyDown(document.body, { key: 'h', altKey: true, metaKey: true, code: 'KeyH' })
    await screen.findByText(/the new block/)

    // ⌘Z: the block is gone, the panel now reads the undo row.
    mockGetPage.mockResolvedValueOnce(page([]))
    mockListRecords.mockResolvedValueOnce([
      { ...record('undo-1', 'the new block'), action: 'undo' },
    ])
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(mockUndo).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(pageColumn.queryByText('the new block')).not.toBeInTheDocument())

    // ONE ⇧⌘Z: the block (and the row) must be back within this same waitFor pass.
    mockGetPage.mockResolvedValueOnce(page([created]))
    mockListRecords.mockResolvedValueOnce([record('rec-1', 'the new block')])
    mockRedo.mockResolvedValue({
      outcome: 'done',
      records: [{ ...record('redo-1', 'the new block'), action: 'redo' }],
    })
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(mockRedo).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(pageColumn.getByText('the new block')).toBeInTheDocument())
    // 4, not 3: `PageChangesPanel` now mounts its own `['page', pageId]`
    // query (for `buildPageChangeRows`'s blocks) alongside `DocumentPanel`'s —
    // a second observer on the same key refetches once on mount (react-query's
    // default `refetchOnMount`), on top of the three staged reads above.
    expect(mockGetPage).toHaveBeenCalledTimes(4)
  })
})
