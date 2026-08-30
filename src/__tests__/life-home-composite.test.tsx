/**
 * The Life home page is a real, composite page (ticket-44 §1).
 *
 * LifeOverviewPanel now renders Life's OWN blocks (the shared BlockCanvas editor)
 * BETWEEN the focal numeral and the areas grid, with the always-visible palette-
 * first "+ Add a block" foot affordance. Empty Life shows just the overview + that
 * add affordance. A block picked from the palette inserts that module's empty
 * state and persists it to the home row via the normal commitBlocks tail — while
 * the areas grid (the workspace) still reads below.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LifeOverviewPanel } from '@/components/organisms/OverviewSurface'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// The areas grid reads ['pages'] — top-level areas + content. NO home row (it's
// stripped by fetchPages upstream), so the composite never double-counts.
const AREA_ROWS = [
  { id: 'health', parent_id: null, type: 'area', title: 'Health', order: 0, updated_at: '2026-08-30T09:00:00Z' },
  { id: 'sleep', parent_id: 'health', type: 'page', title: 'Sleep', order: 0, updated_at: '2026-08-30T09:00:00Z' },
]
const mockFetchPages = jest.fn().mockResolvedValue(AREA_ROWS)
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

// The Life home row — created on first access; its blocks are the composite's
// own content.
let HOME_BLOCKS: Block[] = []
const mockGetOrCreateHomePage = jest.fn()
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: (...args: unknown[]) => mockGetOrCreateHomePage(...args),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

// updateTitle is imported by OverviewSurface (area rename path) — stub it.
jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

function renderLife() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <LifeOverviewPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  HOME_BLOCKS = []
  mockFetchPages.mockResolvedValue(AREA_ROWS)
  mockGetOrCreateHomePage.mockImplementation(() =>
    Promise.resolve({ id: 'home-1', title: 'Life', blocks: HOME_BLOCKS })
  )
})

describe('Life composite surface', () => {
  it('renders the areas grid AND the always-visible add, even when Life is empty', async () => {
    renderLife()
    // The overview still reads: the areas grid shows the top-level area.
    expect(await screen.findByText('Health')).toBeInTheDocument()
    // Empty Life shows the add affordance (no blocks yet) — palette-first foot add.
    expect(await screen.findByRole('button', { name: 'Add a block' })).toBeInTheDocument()
    // No page-title chrome — Life is the overview, not a document editor.
    expect(screen.queryByLabelText('Page title')).not.toBeInTheDocument()
  })

  it('renders Life’s own blocks above the areas grid', async () => {
    HOME_BLOCKS = [{ id: 'b1', type: 'text', content: 'Welcome to my life' }]
    renderLife()
    // Life's own block is reachable (its reading view), and the areas grid too.
    expect(await screen.findByRole('button', { name: 'Edit text block' })).toBeInTheDocument()
    expect(await screen.findByText('Health')).toBeInTheDocument()
  })

  it('the always-visible add opens the palette and inserts the picked module, persisting to the home row', async () => {
    renderLife()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    const filter = await screen.findByLabelText('Filter blocks')
    fireEvent.change(filter, { target: { value: 'Table' } })
    fireEvent.click(await screen.findByText('Table'))

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    // Written to the HOME row (id 'home-1'), not any area.
    const [, , pageId, savedBlocks] = mockCommitBlocks.mock.calls[0]
    expect(pageId).toBe('home-1')
    expect((savedBlocks as Block[]).some((b) => b.type === 'table')).toBe(true)
  })

  it('the palette inserts each module’s empty state (text, todo, table, metric, kanban, chart)', async () => {
    // One render per module keeps each assertion isolated on a fresh empty Life.
    const cases: Array<{ name: string; type: string }> = [
      { name: 'Text', type: 'text' },
      { name: 'Todo', type: 'todo' },
      { name: 'Table', type: 'table' },
      { name: 'Metric', type: 'metric' },
      { name: 'Kanban', type: 'kanban' },
      { name: 'Chart line', type: 'chart-line' },
    ]
    for (const c of cases) {
      HOME_BLOCKS = []
      mockCommitBlocks.mockClear()
      const { unmount } = renderLife()
      fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
      const filter = await screen.findByLabelText('Filter blocks')
      fireEvent.change(filter, { target: { value: c.name } })
      // Pick the exact palette entry (scoped to the menu to avoid stray matches).
      const menu = screen.getByRole('menu', { name: 'Block picker' })
      fireEvent.click(within(menu).getByText(c.name))
      await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
      const saved = mockCommitBlocks.mock.calls[0][3] as Block[]
      expect(saved.some((b) => b.type === c.type)).toBe(true)
      unmount()
    }
  })
})
