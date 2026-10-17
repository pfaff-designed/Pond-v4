/**
 * KAN-388 — opening a page never blanks the canvas: while `['page', id]` is
 * still pending, the row `['pages']` already has for it is enough to paint
 * the title and eyebrow at once. No "Loading…", no skeleton, no block area
 * until the page itself lands.
 */

import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { findTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const mockFetchPages = jest.fn().mockResolvedValue([
  {
    id: 'page-1',
    parent_id: null,
    type: 'page',
    title: 'Kitchen renovation',
    order: 0,
    updated_at: '',
    props: { kind: 'project' },
  },
])
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))
const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
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

beforeEach(() => jest.clearAllMocks())

describe('DocumentPanel — the shell paints before the page lands', () => {
  it('shows the rail row’s title and kind with no "Loading…" while the page query is pending, then fills in blocks', async () => {
    let resolveGetPage!: (value: unknown) => void
    mockGetPage.mockReturnValue(
      new Promise((resolve) => {
        resolveGetPage = resolve
      })
    )

    renderPanel()

    expect(await screen.findByLabelText('Page title')).toHaveValue('Kitchen renovation')
    expect(screen.getByLabelText('Page title')).toHaveAttribute('readonly')
    expect(screen.getByText('project — saved')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()

    await act(async () => {
      resolveGetPage({
        id: 'page-1',
        title: 'Kitchen renovation',
        blocks: [{ id: 'b1', type: 'text', content: 'Notes on the renovation' }],
        props: { kind: 'project' },
      })
    })

    expect(await findTextBlock()).toBeInTheDocument()
  })

  it('shows the same placeholder and eyebrow for an untitled kinded row before and after it lands', async () => {
    mockFetchPages.mockResolvedValueOnce([
      {
        id: 'page-1',
        parent_id: null,
        type: 'page',
        title: '',
        order: 0,
        updated_at: '',
        props: { kind: 'notes' },
      },
    ])
    let resolveGetPage!: (value: unknown) => void
    mockGetPage.mockReturnValue(
      new Promise((resolve) => {
        resolveGetPage = resolve
      })
    )

    renderPanel()

    expect(await screen.findByLabelText('Page title')).toHaveAttribute('placeholder', 'notes name')
    expect(screen.getByText('notes — saved')).toBeInTheDocument()

    await act(async () => {
      resolveGetPage({
        id: 'page-1',
        title: '',
        blocks: [{ id: 'b1', type: 'text', content: 'Grocery list' }],
        props: { kind: 'notes' },
      })
    })

    expect(await screen.findByLabelText('Page title')).toHaveAttribute('placeholder', 'notes name')
    expect(screen.getByText('notes — saved')).toBeInTheDocument()
  })

  it('shows a not-found line when the page is gone and the rail row is already gone too', async () => {
    mockFetchPages.mockResolvedValueOnce([])
    mockGetPage.mockResolvedValue(null)

    renderPanel()

    expect(await screen.findByText('this page is gone — it may be in the trash')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('shows a not-found line when the page is gone but the rail row is still stale', async () => {
    mockGetPage.mockResolvedValue(null)

    renderPanel()

    expect(await screen.findByText('this page is gone — it may be in the trash')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it("shows a quiet didn't-load line (not the gone line) when the fetch errors", async () => {
    mockGetPage.mockRejectedValue(new Error('network error'))

    renderPanel()

    expect(
      await screen.findByText("this page didn't load — reload to try again")
    ).toBeInTheDocument()
    expect(screen.queryByText('this page is gone — it may be in the trash')).toBeNull()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it("shows the gone line (not the didn't-load line) when the fetch settles null", async () => {
    mockGetPage.mockResolvedValue(null)

    renderPanel()

    expect(await screen.findByText('this page is gone — it may be in the trash')).toBeInTheDocument()
    expect(screen.queryByText("this page didn't load — reload to try again")).toBeNull()
  })
})
