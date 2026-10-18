/**
 * KAN-451 — the virtual trash node (`TRASH_NODE_ID`) takes none of the
 * `getPage`/rows-driven page path: it has no `pages` row, so loading it as an
 * ordinary page would 404. The panel instead renders the `TrashPage` stub in
 * place of the editor.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { TRASH_NODE_ID } from '@/lib/change-log/trash-view'
import { withPathProbe } from './helpers/command-path-probe'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'nodeId' ? TRASH_NODE_ID : null),
  }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))
jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(0),
  listRecords: jest.fn().mockResolvedValue([]),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  listPages: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function renderPanelWithPathProbe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        {withPathProbe(<DocumentPanel />)}
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('DocumentPanel — the virtual trash node', () => {
  it('renders the trash stub and never calls getPage for the virtual id', async () => {
    renderPanel()
    await screen.findByText('trash is empty')
    expect(mockGetPage).not.toHaveBeenCalled()
  })

  it('publishes a breadcrumb trail with no databases crumb (KAN-504: trash is a top-level rail row, not a databases child)', async () => {
    renderPanelWithPathProbe()
    await screen.findByText('trash is empty')
    const path = screen.getByTestId('command-path')
    expect(path.textContent).toBe('life › trash')
  })
})
