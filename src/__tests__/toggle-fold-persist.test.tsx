/**
 * KAN-480 build item 6 — clicking a toggle's ▸ writes `folded` through
 * `commitStep` (KAN-355's structural flush, same as `todo/view.tsx`'s own
 * fallback), so it lands as its own change-log record; a reload (a fresh
 * `DocumentPanel` mount reading the now-saved `folded: true`) stays folded.
 * Modelled on `document-panel-split-stored-text.test.tsx`'s mock shape.
 */

import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { resetPageWriteRegistry } from '@/lib/pages/page-flush'
import type { Block } from '@/lib/documents/types'
import type { ToggleBlock } from '@/lib/modules/toggle/schema'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/tree', () => ({
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
  saveBlocks: jest.fn().mockResolvedValue(undefined),
  saveProps: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn(), rememberPending: jest.fn(), markPendingFailed: jest.fn() },
}))

const toggle: ToggleBlock = {
  id: 't1',
  type: 'toggle',
  content: 'packing list',
  body: 'passport',
  folded: false,
}

function renderPanel(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

// The row also hosts `BlockHandleMenu`'s own popup-trigger button, which also
// carries `aria-expanded` — told apart by `aria-haspopup`, which only it has.
const foldButtonIn = (row: HTMLElement) =>
  within(row)
    .getAllByRole('button')
    .find((b) => !b.hasAttribute('aria-haspopup'))!

beforeEach(() => {
  jest.clearAllMocks()
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
})

afterEach(() => {
  cleanup()
  resetPageWriteRegistry()
})

describe('KAN-480 — a toggle fold persists, and a reload stays folded', () => {
  it('click → folded true written through commitStep; reload stays folded', async () => {
    const user = userEvent.setup()
    renderPanel([toggle])

    await screen.findByLabelText('Page title')
    const row = document.getElementById('block-t1')!
    const foldButton = foldButtonIn(row)
    expect(foldButton).toHaveAttribute('aria-expanded', 'true')
    expect(within(row).getByText('passport')).toBeInTheDocument()

    await user.click(foldButton)

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    expect(savedBlocks.find((b) => b.id === 't1')).toMatchObject({ folded: true })

    // A reload: a fresh panel mount, reading the now-persisted folded state.
    cleanup()
    resetPageWriteRegistry()
    mockCommitBlocks.mockClear()
    renderPanel([{ ...toggle, folded: true }])

    await screen.findByLabelText('Page title')
    const reloadedRow = document.getElementById('block-t1')!
    await waitFor(() => expect(foldButtonIn(reloadedRow)).toHaveAttribute('aria-expanded', 'false'))
    expect(within(reloadedRow).queryByText('passport')).not.toBeInTheDocument()
  })
})
