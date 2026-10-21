/**
 * KAN-143 — `DocumentPanel` ties a page's accept marks to a real navigation
 * (a pageId change / a genuine remount), not to how many times an effect
 * runs. `next.config` sets no `reactStrictMode`, so the App Router
 * double-invokes effects (mount → cleanup → mount) in dev — a naive
 * `consumeOnOpen` call in that effect would read the phantom remount as a
 * second open and clear marks nobody has seen yet. Rendered under
 * `<React.StrictMode>` to reproduce exactly that.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { clear, getSnapshot, recordAccept } from '@/lib/change-log/accept-marks'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

function renderPanel() {
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    title: 'kitchen renovation',
    blocks: [{ id: 'b1', type: 'text', content: 'cabinets' }],
    props: {},
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    </React.StrictMode>
  )
}

describe('DocumentPanel open/clear wiring for accept marks (KAN-143)', () => {
  afterEach(() => {
    clear()
    jest.clearAllMocks()
  })

  it('keeps the first open’s marks through StrictMode’s mount-cleanup-mount, then clears them on a real next open', async () => {
    recordAccept('page-1', ['block:b1'], null, '2026-10-17T07:13:00.000Z')

    const { unmount } = renderPanel()
    await screen.findByLabelText('Page title')

    expect(getSnapshot('page-1')).toEqual([
      { target: 'block:b1', recordId: null, acceptedAt: '2026-10-17T07:13:00.000Z' },
    ])

    unmount()
    renderPanel()
    await screen.findByLabelText('Page title')

    expect(getSnapshot('page-1')).toEqual([])
  })
})
