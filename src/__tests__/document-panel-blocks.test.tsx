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
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

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

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DocumentPanel />
    </QueryClientProvider>
  )
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
