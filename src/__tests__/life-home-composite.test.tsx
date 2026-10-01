/**
 * The Life home page is a real, composite page (ticket-44 §1).
 *
 * LifeOverviewPanel now renders Life's OWN blocks (the shared BlockCanvas editor)
 * BETWEEN the focal numeral and the areas grid, with the always-visible text-
 * default "+ Add a block" foot affordance (UI-audit Slice 2a). Empty Life shows
 * just the overview + that add affordance. The add drops an empty text block;
 * typing `/` in it summons the palette to swap type, persisting to the home row
 * via the normal commitBlocks tail — while the areas grid (the workspace) still
 * reads below.
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
  {
    id: 'health',
    parent_id: null,
    type: 'page',
    title: 'Health',
    order: 0,
    updated_at: '2026-08-30T09:00:00Z',
  },
  {
    id: 'sleep',
    parent_id: 'health',
    type: 'page',
    title: 'Sleep',
    order: 0,
    updated_at: '2026-08-30T09:00:00Z',
  },
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
    // Empty Life shows the add affordance (no blocks yet) — text-default foot add.
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

  it('the always-visible add drops an empty text block ready to type — no palette (UI-audit Slice 2a)', async () => {
    renderLife()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    // Text-default: an editable text block appears (in edit mode), ready to type…
    expect(await screen.findByPlaceholderText('Write something…')).toBeInTheDocument()
    // …and the button itself never opens the palette.
    expect(screen.queryByLabelText('Filter blocks')).not.toBeInTheDocument()
  })

  it('add → “/” summons the palette and inserts each module’s empty state onto the home row', async () => {
    // The new flow (UI-audit Slice 2a): the foot add drops a text block; typing `/`
    // as its first char summons the palette to swap type. One render per module keeps
    // each assertion isolated on a fresh empty Life. Kanban is deliberately absent —
    // retired from creation (#19 slice 6) — and so are the eight data-holding display
    // blocks (metric / metric-ring / stat / charts / heatmap / timeline, #111): a chart
    // or a headline figure is a MODE of the view block now, so `View` is what the
    // palette offers. The read-tolerance side is pinned in palette-retired.test.ts.
    const cases: Array<{ name: string; type: string }> = [
      { name: 'Todo', type: 'todo' },
      { name: 'Table', type: 'table' },
      { name: 'View', type: 'view' },
    ]
    for (const c of cases) {
      HOME_BLOCKS = []
      mockCommitBlocks.mockClear()
      const { unmount } = renderLife()
      fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
      // Type `/` in the freshly-dropped text block to summon the palette.
      const editor = await screen.findByPlaceholderText('Write something…')
      fireEvent.change(editor, { target: { value: '/' } })
      const filter = await screen.findByLabelText('Filter blocks')
      fireEvent.change(filter, { target: { value: c.name } })
      // Pick the exact palette entry (scoped to the menu to avoid stray matches).
      const menu = screen.getByRole('menu', { name: 'Block picker' })
      fireEvent.click(within(menu).getByText(c.name))
      // The pick persists to the HOME row (id 'home-1'), not any area.
      await waitFor(
        () => {
          const call = mockCommitBlocks.mock.calls.find(([, , pageId]) => pageId === 'home-1')
          expect(call).toBeTruthy()
          expect((call![3] as Block[]).some((b) => b.type === c.type)).toBe(true)
          // G2 (#98 review): this is the person's own typed edit, so the save
          // carries `ownEdit` and a pending diff aimed at Life goes outdated.
          // It was the one debounced whole-array user save that did not.
          expect(call![5]).toMatchObject({ ownEdit: true })
        },
        { timeout: 2000 }
      )
      unmount()
    }
  })
})
