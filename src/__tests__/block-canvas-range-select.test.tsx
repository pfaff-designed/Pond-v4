/**
 * KAN-373 slice A — ⇧↑/⇧↓ on a focused row, and ⇧-click on another row's
 * chrome, extend a canvas-level block range; every block in it draws
 * `selected`. Esc clears the range and keeps the focus end selected. Inside
 * a text editor, ⇧↑/⇧↓ stays the editor's own text selection — the range is
 * only reachable from the row itself (`e.target === e.currentTarget`).
 */

import React from 'react'
import { act, fireEvent, render, within } from '@testing-library/react'
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

const text = (id: string, content: string): Block => ({ id, type: 'text', content })

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
const textBlockIn = (id: string) =>
  within(blockRoot(id)).findByRole('textbox', { name: 'text block' })
// A text block is bare prose, not a `PondBlock` card: `selected` draws the
// library's ring directly on `[data-part="prose"]` rather than setting
// `data-block-state` (block-canvas-range-delete-undo-path.test.tsx asserts
// the same ring).
const proseSelected = (id: string) =>
  blockRoot(id).querySelector('[data-part="prose"]')?.classList.contains('ring-mn-text') ?? false

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

  it('range 2-4, then focusing block 5s editor clears it — no block draws selected', async () => {
    const blocks = [
      text('b-1', 'one'),
      text('b-2', 'two'),
      text('b-3', 'three'),
      text('b-4', 'four'),
      text('b-5', 'five'),
    ]
    renderCanvas(blocks)

    const field2 = await textBlockIn('b-2')
    field2.focus()
    fireEvent.keyDown(field2, { key: 'Escape' })
    expect(blockRoot('b-2')).toHaveFocus()
    fireEvent.keyDown(blockRoot('b-2'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-3'), { key: 'ArrowDown', shiftKey: true })
    expect(proseSelected('b-3')).toBe(true)

    const field5 = await textBlockIn('b-5')
    act(() => field5.focus())

    expect(proseSelected('b-1')).toBe(false)
    expect(proseSelected('b-2')).toBe(false)
    expect(proseSelected('b-3')).toBe(false)
    expect(proseSelected('b-4')).toBe(false)
    expect(proseSelected('b-5')).toBe(false)
  })

  it('range 2-4, then ⌘⌫ at block 3s own caret only deletes block 3, never the range', async () => {
    const blocks = [
      text('b-1', 'one'),
      text('b-2', 'two'),
      text('b-3', 'three'),
      text('b-4', 'four'),
      text('b-5', 'five'),
    ]
    renderCanvas(blocks)

    const field2 = await textBlockIn('b-2')
    field2.focus()
    fireEvent.keyDown(field2, { key: 'Escape' })
    expect(blockRoot('b-2')).toHaveFocus()
    fireEvent.keyDown(blockRoot('b-2'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-3'), { key: 'ArrowDown', shiftKey: true })
    expect(proseSelected('b-4')).toBe(true)

    // The caret lands at the document start on a bare `.focus()`, the same
    // fact `block-canvas-delete-undo-path.test.tsx` relies on for its own
    // caret-start ⌘⌫ tests — so this fires the `inOwnEditor` path, not a
    // row-focused one.
    const field3 = await textBlockIn('b-3')
    act(() => field3.focus())
    fireEvent.keyDown(field3, { key: 'Backspace', ctrlKey: true })

    // Only block 3's own delete path ran: its single-block confirm, never
    // the range's.
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Delete this block?'
    )
  })

  it('range, then a plain ↓ off the range onto a new row clears it', () => {
    const blocks = [table('b-0', 'a'), table('b-1', 'b'), table('b-2', 'c'), table('b-3', 'd')]
    renderCanvas(blocks)

    blockRoot('b-0').focus()
    fireEvent.keyDown(blockRoot('b-0'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-1'), { key: 'ArrowDown', shiftKey: true })
    expect(stateOf('b-2')).toBe('selected')

    fireEvent.keyDown(blockRoot('b-2'), { key: 'ArrowDown' })

    expect(stateOf('b-0')).toBe('rest')
    expect(stateOf('b-1')).toBe('rest')
    expect(stateOf('b-2')).toBe('rest')
  })
})
