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
    // #237: the title is the block card's eyebrow (the view's own caption is
    // CSS-hidden under the frame, so both nodes exist in jsdom).
    expect(screen.getAllByText('Power Tools').length).toBeGreaterThan(0)
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

  // #98 review, BLOCKING 3. Renaming a page runs the same debounced save, which
  // carries `ownEdit` and therefore the outdated sweep. A title change is NOT an
  // edit to any diff's target, and `outdated` is one-way — it drops accept — so
  // a rename that swept the page would silently destroy every pending diff on
  // it. The guard is the blocks handed to the sweep: unchanged here, so
  // `markOutdated` spares every record whose `before` still matches them.
  it('a title-only rename saves the blocks UNCHANGED, so the sweep spares pending diffs', async () => {
    renderPanel()
    const titleInput = await screen.findByLabelText('Page title')
    fireEvent.change(titleInput, { target: { value: 'Workshop notes' } })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    expect(mockUpdateTitle).toHaveBeenCalledWith(expect.anything(), 'page-1', 'Workshop notes')
    const [, , , savedBlocks, opts] = mockCommitBlocks.mock.calls[0]
    // Still an own edit — the sweep runs; what makes the rename harmless is that
    // the blocks it is handed are byte-for-byte the ones the diffs were written
    // against.
    expect(opts).toMatchObject({ ownEdit: true })
    expect(savedBlocks).toEqual(blocks)
  })
})

// ── The ticket-22 surface switch: blocks AND children on one surface ──────────
// #108: the switch reads no type tag — a page shows the overview because it HAS
// children and no blocks of its own. Everything below is a page.

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

describe('every page is the one page surface (ticket-22, #108, #234): blocks and children both render', () => {
  it('an area WITH blocks renders its content plus the children grid', async () => {
    renderWith({ id: 'page-1', type: 'page', title: 'Workout Routines', blocks: quote }, [
      nodeRow({}),
      childRow,
    ])
    // Its own content is reachable: title editor + the block's reading view.
    expect(await screen.findByLabelText('Page title')).toHaveValue('Workout Routines')
    expect(await screen.findByRole('button', { name: 'Edit text block' })).toBeInTheDocument()
    // And its children still show, below, as the shared grid.
    expect(await screen.findByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
  })

  it('a page with children and no blocks is the SAME page — title, add affordance, children', async () => {
    renderWith({ id: 'page-1', type: 'page', title: 'Health', blocks: [] }, [
      nodeRow({ title: 'Health' }),
      childRow,
    ])
    expect(await screen.findByLabelText('Page title')).toHaveValue('Health')
    expect(await screen.findByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add a block' })).toBeInTheDocument()
    // #234: no bespoke container surface, no affordance of its own.
    expect(screen.queryByRole('button', { name: '+ Add content' })).not.toBeInTheDocument()
    expect(screen.queryByText(/at a glance/)).not.toBeInTheDocument()
  })

  it('a page with children persists a picked block to itself, with its children still below', async () => {
    renderWith({ id: 'page-1', type: 'page', title: 'Health', blocks: [] }, [
      nodeRow({ title: 'Health' }),
      childRow,
    ])
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    const editor = await screen.findByPlaceholderText('Write something…')
    fireEvent.change(editor, { target: { value: '/' } })
    await screen.findByRole('listbox', { name: 'blocks' })
    // #278: the query is the text typed on the page after the `/`.
    fireEvent.change(editor, { target: { value: '/check' } })
    // The matched label is split pre / hit / post, so find the row by its whole text.
    const row = await waitFor(() => {
      const match = screen.getAllByRole('option').find((o) => o.textContent?.includes('checklist'))
      if (!match) throw new Error('no checklist row')
      return match
    })
    fireEvent.click(row)

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const call = mockCommitBlocks.mock.calls.find(([, , pageId]) => pageId === 'page-1')!
    expect((call[3] as Block[]).some((b) => b.type === 'todo')).toBe(true)
    expect(screen.getByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
  })

  // #108 — nothing is keyed on a type tag, and nothing on children either.
  it('a childless page with no blocks renders the page, with no grid', async () => {
    renderWith({ id: 'page-1', type: 'page', title: 'Fresh page', blocks: [] }, [
      nodeRow({ title: 'Fresh page' }),
    ])
    expect(await screen.findByLabelText('Page title')).toHaveValue('Fresh page')
    expect(screen.queryByText('3-Day Full-Body Dumbbell Routine')).not.toBeInTheDocument()
  })

  it('a project with children and no blocks gets the same page a page would', async () => {
    renderWith({ id: 'page-1', type: 'project', title: 'Bench build', blocks: [] }, [
      nodeRow({ type: 'project', title: 'Bench build' }),
      childRow,
    ])
    expect(await screen.findByLabelText('Page title')).toHaveValue('Bench build')
    expect(await screen.findByText('3-Day Full-Body Dumbbell Routine')).toBeInTheDocument()
  })
})
