/**
 * KAN-373 slice A — ⇧↑/⇧↓ on a focused row, and ⇧-click on another row's
 * chrome, extend a canvas-level block range; every block in it draws
 * `selected`. Esc clears the range and keeps the focus end selected. Inside
 * a text editor, ⇧↑/⇧↓ stays the editor's own text selection — the range is
 * only reachable from the row itself (`e.target === e.currentTarget`).
 */

import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: [],
    rows: [],
    isLoading: false,
    isError: false,
    setValue: jest.fn(),
    addRow: jest.fn(),
    removeRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
  }),
}))
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', parentId: null, blocks: [] }),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))
const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

// Non-text (tabIndex 0): the row itself takes keyboard focus directly, same
// fixture shape as `block-canvas-step-move.test.tsx`.
const table = (id: string, name: string): Block => ({
  id,
  type: 'table',
  columns: ['Tool'],
  rows: [{ id: `r-${id}`, cells: [name] }],
})

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  return <BlockCanvas blocks={blocks} pageId="page-1" pageTitle="range" onChange={setBlocks} />
}

function renderCanvas(initial: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (id: string) => document.getElementById(`block-${id}`)!
const stateOf = (id: string) => blockRoot(id).querySelector('[data-block-state]')?.getAttribute('data-block-state')

beforeEach(() => jest.clearAllMocks())

describe('⇧↑/⇧↓ and ⇧-click extend a block range (KAN-373)', () => {
  it('three ⇧↓ presses from the selected first row select 4 blocks', () => {
    const blocks = [table('b-0', 'a'), table('b-1', 'b'), table('b-2', 'c'), table('b-3', 'd'), table('b-4', 'e')]
    renderCanvas(blocks)

    blockRoot('b-0').focus()
    fireEvent.keyDown(blockRoot('b-0'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-1'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-2'), { key: 'ArrowDown', shiftKey: true })

    expect(stateOf('b-0')).toBe('selected')
    expect(stateOf('b-1')).toBe('selected')
    expect(stateOf('b-2')).toBe('selected')
    expect(stateOf('b-3')).toBe('selected')
    expect(stateOf('b-4')).toBe('rest')
    expect(blockRoot('b-3')).toHaveFocus()
  })

  it('⇧↑ on the first block does nothing', () => {
    const blocks = [table('b-0', 'a'), table('b-1', 'b')]
    renderCanvas(blocks)

    blockRoot('b-0').focus()
    fireEvent.keyDown(blockRoot('b-0'), { key: 'ArrowUp', shiftKey: true })

    expect(stateOf('b-1')).toBe('rest')
    expect(blockRoot('b-0')).toHaveFocus()
  })

  it('⇧-click on another row sets the range focus to it', () => {
    const blocks = [table('b-0', 'a'), table('b-1', 'b'), table('b-2', 'c'), table('b-3', 'd')]
    renderCanvas(blocks)

    fireEvent.click(blockRoot('b-1'))
    fireEvent.click(blockRoot('b-3'), { shiftKey: true })

    expect(stateOf('b-0')).toBe('rest')
    expect(stateOf('b-1')).toBe('selected')
    expect(stateOf('b-2')).toBe('selected')
    expect(stateOf('b-3')).toBe('selected')
  })

  it('Esc clears the range and keeps the focus end selected', () => {
    const blocks = [table('b-0', 'a'), table('b-1', 'b'), table('b-2', 'c')]
    renderCanvas(blocks)

    blockRoot('b-0').focus()
    fireEvent.keyDown(blockRoot('b-0'), { key: 'ArrowDown', shiftKey: true })
    expect(stateOf('b-1')).toBe('selected')

    fireEvent.keyDown(blockRoot('b-1'), { key: 'Escape' })

    expect(stateOf('b-0')).toBe('rest')
    expect(stateOf('b-1')).toBe('selected')
    expect(blockRoot('b-1')).toHaveFocus()
  })

  it('⇧↓ inside a text editor extends no range', async () => {
    const blocks = [table('b-0', 'a'), { id: 'b-text', type: 'text', content: 'hi' } as Block, table('b-2', 'c')]
    renderCanvas(blocks)

    const field = await findTextBlock()
    fireEvent.keyDown(field, { key: 'ArrowDown', shiftKey: true })

    expect(stateOf('b-0')).toBe('rest')
    expect(stateOf('b-2')).toBe('rest')
  })
})
