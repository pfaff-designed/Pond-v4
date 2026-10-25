/**
 * KAN-464 — "a new page opens with the caret in its title". `requestTitleFocus`
 * is the one-shot request a creator (rail ＋, ⌘K, `/page`) fires before
 * navigating; the real, editable `PageTitleRow` claims it on mount and
 * focuses. The readOnly pending shell never gets a `pageId`, so it never
 * consumes — proved separately by its own `readOnly` prop in DocumentPanel.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestTitleFocus } from '@/lib/pages/title-focus'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))
const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Kitchen renovation', blocks: [], props: {} })
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

describe('DocumentPanel — claiming a title-focus request (KAN-464)', () => {
  it('a pending request for this page focuses the title on mount', async () => {
    requestTitleFocus('page-1')
    renderPanel()
    const title = await screen.findByLabelText('Page title')
    expect(title).toHaveFocus()
  })

  it('with no pending request, the title is not focused', async () => {
    renderPanel()
    const title = await screen.findByLabelText('Page title')
    expect(title).not.toHaveFocus()
  })
})
