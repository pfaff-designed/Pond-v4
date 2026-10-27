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

const checklist = (id: string, label: string): Block =>
  ({
    id,
    type: 'todo',
    marker: 'check',
    label,
    items: [{ id: `${id}-i1`, label: 'one', checked: false }],
  }) as Block

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
const headOf = (id: string) => blockRoot(id).querySelector('[data-part="block-head"]')!

/**
 * Models a real browser's mousedown → focus-steal → click sequence, which
 * jsdom never produces on its own (`fireEvent.click` alone never moves
 * `document.activeElement`). `pointerdown`'s return value is `dispatchEvent`'s
 * own — `false` once a handler calls `preventDefault()` — so this only
 * applies the focus browsers give for free (the row's default action on an
 * unprevented mousedown) when BlockCanvas's own handler actually left it
 * alone, exactly the fact KAN-373's pointerdown fix turns on.
 */
function pointerThenClick(
  target: Element,
  opts: { shiftKey?: boolean; focusTarget?: Element } = {}
) {
  const shiftKey = opts.shiftKey ?? false
  const notPrevented = fireEvent.pointerDown(target, { shiftKey, button: 0 })
  if (notPrevented) act(() => (opts.focusTarget as HTMLElement | undefined)?.focus())
  fireEvent.click(target, { shiftKey })
}

/** Every selected index must sit next to the last one — KAN-373's "never two
 *  non-adjacent rings" guarantee, checked generically rather than against one
 *  hand-picked pair. */
function assertRingsContiguous(blocks: Block[]) {
  const selected = blocks
    .map((b, i) => ({ i, on: b.type === 'text' ? proseSelected(b.id) : stateOf(b.id) === 'selected' }))
    .filter((entry) => entry.on)
    .map((entry) => entry.i)
  for (let k = 1; k < selected.length; k++) {
    expect(selected[k]).toBe(selected[k - 1] + 1)
  }
}

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

    pointerThenClick(blockRoot('b-1'), { focusTarget: blockRoot('b-1') })
    pointerThenClick(blockRoot('b-3'), { shiftKey: true, focusTarget: blockRoot('b-3') })

    expect(stateOf('b-0')).toBe('rest')
    expect(stateOf('b-1')).toBe('selected')
    expect(stateOf('b-2')).toBe('selected')
    expect(stateOf('b-3')).toBe('selected')
  })

  it('a real browser focuses the clicked row on pointerdown, before click — select block 1 then ⇧-click block 3 (text) selects 1–3', async () => {
    const blocks = [table('b-1', 'a'), text('b-2', 'two'), text('b-3', 'three')]
    renderCanvas(blocks)

    pointerThenClick(blockRoot('b-1'), { focusTarget: blockRoot('b-1') })
    expect(stateOf('b-1')).toBe('selected')

    const field3 = await textBlockIn('b-3')
    pointerThenClick(field3, { shiftKey: true, focusTarget: field3 })

    expect(stateOf('b-1')).toBe('selected')
    expect(proseSelected('b-2')).toBe(true)
    expect(proseSelected('b-3')).toBe(true)
  })

  it('select a text block, then ⇧-click a checklist header — the range spans them', async () => {
    const blocks = [text('b-1', 'one'), table('b-2', 'mid'), checklist('b-3', 'actions')]
    renderCanvas(blocks)

    const field1 = await textBlockIn('b-1')
    field1.focus()
    fireEvent.keyDown(field1, { key: 'Escape' })
    expect(blockRoot('b-1')).toHaveFocus()

    pointerThenClick(headOf('b-3'), { shiftKey: true, focusTarget: blockRoot('b-3') })

    expect(proseSelected('b-1')).toBe(true)
    expect(stateOf('b-2')).toBe('selected')
    expect(stateOf('b-3')).toBe('selected')
  })

  it('⇧-click with nothing selected does not build a range', () => {
    const blocks = [table('b-1', 'a'), table('b-2', 'b')]
    renderCanvas(blocks)

    pointerThenClick(blockRoot('b-2'), { shiftKey: true, focusTarget: blockRoot('b-2') })

    expect(stateOf('b-1')).toBe('rest')
  })

  it("the verifier's sequence — alpha, Esc, ⇧-click checklist, click alpha, Esc — never leaves two non-adjacent rings", async () => {
    const blocks = [text('alpha', 'alpha'), table('mid', 'middle'), checklist('checklist', 'actions')]
    renderCanvas(blocks)

    const field = await textBlockIn('alpha')
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(blockRoot('alpha')).toHaveFocus()
    assertRingsContiguous(blocks)

    pointerThenClick(headOf('checklist'), { shiftKey: true, focusTarget: blockRoot('checklist') })
    expect(proseSelected('alpha')).toBe(true)
    expect(stateOf('mid')).toBe('selected')
    expect(stateOf('checklist')).toBe('selected')
    assertRingsContiguous(blocks)

    pointerThenClick(field, { focusTarget: field })
    expect(stateOf('mid')).toBe('rest')
    expect(stateOf('checklist')).toBe('rest')
    assertRingsContiguous(blocks)

    fireEvent.keyDown(field, { key: 'Escape' })
    expect(stateOf('mid')).toBe('rest')
    expect(stateOf('checklist')).toBe('rest')
    assertRingsContiguous(blocks)
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
