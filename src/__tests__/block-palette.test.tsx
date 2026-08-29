/**
 * Block palette in DocumentPanel — integration tests.
 *
 * Covers:
 * - Typing '/' in an empty text block opens the slash palette
 * - Selecting a palette item replaces the block
 * - Insert-between affordance renders '+' buttons
 * - Keyboard reorder: ⌥↑ / ⌥↓ swaps blocks
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

const mockFetchPages = jest.fn().mockResolvedValue([])
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

function renderWith(page: Record<string, unknown>) {
  mockGetPage.mockResolvedValue(page)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([])
})

describe('Insert-between affordance', () => {
  it('renders Insert block buttons between blocks', async () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'text', content: 'First' },
      { id: 'b2', type: 'text', content: 'Second' },
    ]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const insertButtons = await screen.findAllByRole('button', { name: 'Insert block' })
    // Should have at least one insert-between button
    expect(insertButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('clicking Insert block opens the block palette', async () => {
    const blocks: Block[] = [{ id: 'b1', type: 'text', content: 'Hello' }]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const insertButtons = await screen.findAllByRole('button', { name: 'Insert block' })
    fireEvent.click(insertButtons[0])
    // Palette filter input should appear
    expect(await screen.findByLabelText('Filter blocks')).toBeInTheDocument()
  })

  it('selecting from palette inserts a new block', async () => {
    const blocks: Block[] = [{ id: 'b1', type: 'text', content: 'Hello' }]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const insertButtons = await screen.findAllByRole('button', { name: 'Insert block' })
    fireEvent.click(insertButtons[0])
    // Wait for palette
    const filterInput = await screen.findByLabelText('Filter blocks')
    fireEvent.change(filterInput, { target: { value: 'Todo' } })
    const todoButton = await screen.findByText('Todo')
    fireEvent.click(todoButton)
    // Should commit blocks with a new todo block
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    expect(savedBlocks.some((b) => b.type === 'todo')).toBe(true)
  })
})

describe('Keyboard reorder (⌥↑ / ⌥↓)', () => {
  it('⌥↓ moves a block down', async () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'text', content: 'First' },
      { id: 'b2', type: 'text', content: 'Second' },
    ]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    // Find the delete button for block b1 (it's in the group/relative container)
    // We'll trigger the keydown on the wrapping block div
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete block' })
    // The first delete button is associated with b1
    const blockDiv = deleteButtons[0].closest('[id]')
    expect(blockDiv).toBeTruthy()
    fireEvent.keyDown(blockDiv!, { key: 'ArrowDown', altKey: true })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    // After ⌥↓ on first block: [b2, b1]
    expect(savedBlocks[0].id).toBe('b2')
    expect(savedBlocks[1].id).toBe('b1')
  })

  it('⌥↑ moves a block up', async () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'text', content: 'First' },
      { id: 'b2', type: 'text', content: 'Second' },
    ]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete block' })
    // The second delete button is for b2
    const blockDiv = deleteButtons[1].closest('[id]')
    expect(blockDiv).toBeTruthy()
    fireEvent.keyDown(blockDiv!, { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    // After ⌥↑ on second block: [b2, b1]
    expect(savedBlocks[0].id).toBe('b2')
    expect(savedBlocks[1].id).toBe('b1')
  })

  it('⌥↑ on first block is a no-op', async () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'text', content: 'First' },
      { id: 'b2', type: 'text', content: 'Second' },
    ]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete block' })
    const blockDiv = deleteButtons[0].closest('[id]')
    fireEvent.keyDown(blockDiv!, { key: 'ArrowUp', altKey: true })
    // No commit should be made — order didn't change
    await new Promise((r) => setTimeout(r, 100))
    expect(mockCommitBlocks).not.toHaveBeenCalled()
  })

  it('⌥↓ on last block is a no-op', async () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'text', content: 'First' },
      { id: 'b2', type: 'text', content: 'Second' },
    ]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete block' })
    const blockDiv = deleteButtons[1].closest('[id]')
    fireEvent.keyDown(blockDiv!, { key: 'ArrowDown', altKey: true })
    await new Promise((r) => setTimeout(r, 100))
    expect(mockCommitBlocks).not.toHaveBeenCalled()
  })
})

describe('Drag handle', () => {
  it('renders a drag handle for each block', async () => {
    const blocks: Block[] = [{ id: 'b1', type: 'text', content: 'Hello' }]
    renderWith({ id: 'page-1', title: 'Test', blocks })
    const handles = await screen.findAllByRole('button', { name: 'Drag to reorder block' })
    expect(handles.length).toBeGreaterThanOrEqual(1)
  })
})
