/**
 * KAN-275 path test: walks PATH_STEPS A and D against the real hosting
 * surfaces (not the internal helpers directly), the acceptance a person would
 * actually hit.
 *
 * A — a handle-menu block delete never lets the page get deleted: `deletePage`
 * is never called, and the block that was typed into survives untouched.
 * D — the rail's roving focus follows only its own arrow/Home/End keys, and a
 * bare Delete/Backspace on a focused row never calls `onDelete`.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { queryAllTextBlocks, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const mockFetchPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
const mockDeletePage = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

// `removeBlockAt` (KAN-368) writes directly through `saveBlocks`/`appendOwnEdit`,
// not the debounced `commitBlocks` path above.
const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([])
})

function renderPage(page: Record<string, unknown>) {
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

describe('PATH_STEPS A — delete a block from its handle menu', () => {
  it('shows the undo toast, keeps the other blocks, and never deletes the page', async () => {
    const user = userEvent.setup()
    const blocks: Block[] = [
      { id: 'b1', type: 'text', content: 'first' },
      { id: 'b2', type: 'text', content: 'second' },
      { id: 'b3', type: 'text', content: 'third' },
    ]
    renderPage({ id: 'page-1', title: 'throwaway', blocks })

    const fields = await screen.findAllByRole('textbox', { name: 'text block' })
    writeInTextBlock(fields[0], 'first')
    writeInTextBlock(fields[1], 'second')
    writeInTextBlock(fields[2], 'third')

    const handles = await screen.findAllByRole('button', { name: 'Block menu' })
    await user.click(handles[1])
    await user.click(await screen.findByRole('menuitem', { name: 'delete' }))

    expect(await screen.findByText('deleted text ·')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    await waitFor(() => expect(queryAllTextBlocks()).toHaveLength(2))
    expect(queryAllTextBlocks().map((f) => f.textContent)).toEqual(['first', 'third'])

    // The page itself is never touched by this — only a rail row's own ⋯/×
    // control reaches `deletePage` (KAN-221), and this surface never calls it.
    expect(mockDeletePage).not.toHaveBeenCalled()
  })
})

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

const creativity = node('creativity', 'creativity', [
  node('books', 'books', [], 'creativity'),
  node('recipes', 'recipes', [], 'creativity', 1),
])
const scratch = node('scratch', 'scratch', [], null, 1)
const databases = node('root-db', 'databases', [], null, 9)

function setupRail() {
  const handlers = {
    onRename: jest.fn(),
    onPickGlyph: jest.fn(),
    onDelete: jest.fn(),
    onAddChild: jest.fn(),
    onSelect: jest.fn(),
  }
  const utils = render(
    <RailView
      tree={[creativity, scratch, databases]}
      pondName="life"
      selectedId={null}
      expanded={new Set(['creativity'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onToggle={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
      {...handlers}
    />
  )
  return { ...utils, ...handlers }
}

const row = (name: string) => screen.getByRole('treeitem', { name })

describe('PATH_STEPS D — rail keys move focus; Delete/Backspace never touch the page', () => {
  it('↓/↑/Home/End move focus, ↵ opens, F2 renames, + creates, and a bare ⌫/Delete deletes nothing', async () => {
    const { onSelect, onAddChild, onDelete } = setupRail()

    row('books').focus()
    fireEvent.keyDown(row('books'), { key: 'ArrowDown' })
    expect(row('recipes')).toHaveFocus()
    fireEvent.keyDown(row('recipes'), { key: 'ArrowUp' })
    expect(row('books')).toHaveFocus()
    fireEvent.keyDown(row('books'), { key: 'End' })
    expect(row('databases')).toHaveFocus()
    fireEvent.keyDown(row('databases'), { key: 'Home' })
    expect(row('life')).toHaveFocus()

    fireEvent.keyDown(row('books'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('books')

    fireEvent.keyDown(row('books'), { key: 'F2' })
    expect(screen.getByRole('textbox', { name: 'rename books' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'rename books' }), { key: 'Escape' })

    fireEvent.keyDown(row('books'), { key: '+' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /^page/ }))
    expect(onAddChild).toHaveBeenCalledWith('books', 'page')

    fireEvent.keyDown(row('books'), { key: 'Backspace' })
    fireEvent.keyDown(row('books'), { key: 'Delete' })
    expect(onDelete).not.toHaveBeenCalled()
    expect(row('books')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'books' })).toHaveTextContent('books')
  })
})
