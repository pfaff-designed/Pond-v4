/**
 * DocumentPanel renders every registered block type through the module registry.
 *
 * The gap this locks (handoff 2026-08-17): DocumentPanel hand-rolled its per-type
 * editors (text/todo/metric only), so a saved `table` block showed as an empty
 * shell with just a delete button — visible to the chat layer, invisible to the
 * human editor. The panel now dispatches through ModuleView (editable), so a new
 * module needs no DocumentPanel edit and edits flow through the debounced save.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// The composite surface (ticket-22) reads the flat page tree to derive this
// node's children; per-test rows drive the children grid (empty = no grid).
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

const blocks: Block[] = [
  { id: 'b-text', type: 'text', content: 'Notes on the workbench build' },
  {
    id: 'b-table',
    type: 'table',
    title: 'Power Tools',
    columns: ['Tool', 'Location'],
    rows: [
      { id: 'r1', cells: ['Table Saw', 'Centre of shop'] },
      { id: 'r2', cells: ['Bandsaw', 'Left wall'] },
    ],
  },
]

function renderWith(page: Record<string, unknown>, rows: Record<string, unknown>[] = []) {
  mockGetPage.mockResolvedValue(page)
  mockFetchPages.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {/* ticket-27: block-delete undo reads the shared DeletionUndoProvider */}
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function renderPanel() {
  return renderWith({ id: 'page-1', title: 'Workshop', blocks })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DocumentPanel block rendering (via the module registry)', () => {
  it('renders a text block click-to-edit: reading view first, textarea on click', async () => {
    renderPanel()
    // ticket-20: a non-empty text block renders its (mocked) markdown reading view,
    // not a raw textarea. Clicking the edit trigger drops into the source with content intact.
    const trigger = await screen.findByRole('button', { name: 'Edit text block' })
    expect(screen.queryByDisplayValue('Notes on the workbench build')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(await screen.findByDisplayValue('Notes on the workbench build')).toBeInTheDocument()
  })

  it('renders a saved table block with its cells, not an empty shell', async () => {
    renderPanel()
    expect(await screen.findByDisplayValue('Table Saw')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Centre of shop')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bandsaw')).toBeInTheDocument()
    expect(screen.getByText('Power Tools')).toBeInTheDocument()
  })

  it('persists a table cell edit through the debounced save', async () => {
    renderPanel()
    const cell = await screen.findByDisplayValue('Table Saw')
    fireEvent.change(cell, { target: { value: 'Mitre Saw' } })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    const table = savedBlocks.find((b) => b.type === 'table')
    expect(table && table.type === 'table' && table.rows[0].cells[0]).toBe('Mitre Saw')
    // The edit is wholesale block state — the untouched rows must survive.
    expect(table && table.type === 'table' && table.rows[1].cells).toEqual(['Bandsaw', 'Left wall'])
  })
})

// ── The ticket-22 type-switch: blocks AND children on one surface ─────────────

const NOW = new Date().toISOString()
const nodeRow = (over: Record<string, unknown>) => ({
  id: 'page-1',
  parent_id: null,
  type: 'page',
  title: 'Workout Routines',
  order: 0,
  updated_at: NOW,
  ...over,
})
const childRow = nodeRow({
  id: 'child-1',
  parent_id: 'page-1',
  title: '3-Day Full-Body Dumbbell Routine',
})
const quote: Block[] = [{ id: 'b-quote', type: 'text', content: 'Consistency beats intensity' }]

describe('DocumentPanel type-switch (ticket-22): blocks and children both render', () => {
  it('an area WITH blocks renders the editor (its content) plus the children grid', async () => {
    renderWith({ id: 'page-1', type: 'area', title: 'Workout Routines', blocks: quote }, [
      nodeRow({ type: 'area' }),
      childRow,
    ])
    // Its own content is reachable: title editor + the block's reading view.
    expect(await screen.findByLabelText('Page title')).toHaveValue('Workout Routines')
    expect(await screen.findByRole('button', { name: 'Edit text block' })).toBeInTheDocument()
    // And its children still show, below, as the shared grid.
    expect(await screen.findByText('Everything within')).toBeInTheDocument()
    expect(screen.getByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
    // No pure-overview affordance — this is the composite surface.
    expect(screen.queryByRole('button', { name: '+ Add content' })).not.toBeInTheDocument()
  })

  it('a page WITH children renders the editor plus the children grid', async () => {
    renderWith({ id: 'page-1', type: 'page', title: 'Workout Routines', blocks: quote }, [
      nodeRow({}),
      childRow,
    ])
    expect(await screen.findByLabelText('Page title')).toHaveValue('Workout Routines')
    expect(await screen.findByText('Everything within')).toBeInTheDocument()
    expect(screen.getByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
  })

  it('a pure area (no blocks) keeps the overview, with a "+ Add content" affordance', async () => {
    renderWith({ id: 'page-1', type: 'area', title: 'Health', blocks: [] }, [
      nodeRow({ type: 'area', title: 'Health' }),
      childRow,
    ])
    expect(await screen.findByRole('button', { name: '+ Add content' })).toBeInTheDocument()
    expect(await screen.findByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
    // No editor chrome on the pure overview.
    expect(screen.queryByLabelText('Page title')).not.toBeInTheDocument()
  })

  it('"+ Add content" promotes a pure area to the editor and persists the new block', async () => {
    renderWith({ id: 'page-1', type: 'area', title: 'Health', blocks: [] }, [
      nodeRow({ type: 'area', title: 'Health' }),
      childRow,
    ])
    fireEvent.click(await screen.findByRole('button', { name: '+ Add content' }))

    // The node flips to the composite editor…
    expect(await screen.findByLabelText('Page title')).toHaveValue('Health')
    expect(await screen.findByText('Everything within')).toBeInTheDocument()
    // …and the added block rides the same debounced save as any edit.
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    expect(savedBlocks).toHaveLength(1)
    expect(savedBlocks[0].type).toBe('text')
  })
})
