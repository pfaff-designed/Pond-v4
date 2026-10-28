/**
 * KAN-515 build item 5 — a toggle heading's fold goes through the same
 * `commitStep` path as KAN-480's own toggle (`toggle-fold-persist.test.tsx`),
 * so a reload (a fresh `DocumentPanel` mount reading the now-saved
 * `folded: true`) renders already folded, chevron and hidden sibling alike.
 * Modelled on `document-panel-split-stored-text.test.tsx`'s mock shape.
 */

import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { resetPageWriteRegistry } from '@/lib/pages/page-flush'
import type { Block } from '@/lib/documents/types'

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

const toggleHeading: Block = { id: 'b-toggle', type: 'text', content: '## ingredients', toggle: true }
const childOne: Block = { id: 'b-child-1', type: 'text', content: 'flour' }

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
// carries `aria-expanded` — told apart by its accessible name (`fold`/`unfold`),
// which only the ▸ button has.
const foldButtonIn = (row: HTMLElement) => within(row).getByRole('button', { name: /^(fold|unfold)$/ })

beforeEach(() => {
  jest.clearAllMocks()
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
})

afterEach(() => {
  cleanup()
  resetPageWriteRegistry()
})

describe('KAN-515 — a toggle heading saved folded renders already folded on reload', () => {
  it('a reload reads the saved folded: true, chevron closed, hidden sibling absent', async () => {
    renderPanel([{ ...toggleHeading, folded: true }, childOne])

    await screen.findByLabelText('Page title')
    const headingRow = document.getElementById('block-b-toggle')!
    await waitFor(() => expect(foldButtonIn(headingRow)).toHaveAttribute('aria-expanded', 'false'))
    expect(document.getElementById('block-b-child-1')).not.toBeInTheDocument()
  })
})
