/**
 * KAN-367 — the person's path, keys only, on the real `BlockCanvas`: text,
 * a checklist, then text. ↑ walks from the lower text's own line up through
 * the checklist's items into the upper text; Esc selects that text's row
 * (with the library's ring); ↓ walks the selection back down through the
 * checklist to the lower text; Return re-enters it at its end. jsdom has no
 * layout, so `endOfTextblock` is stubbed true, same as `next-block.test.ts`
 * and `kan-464-path.test.tsx`.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorView } from '@tiptap/pm/view'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { textEditorOf } from './helpers/text-block'

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

const alpha: Block = { id: 'b-alpha', type: 'text', content: 'alpha' }
const checklist: Block = {
  id: 'b-checklist',
  type: 'todo',
  items: [
    { id: 'i-one', label: 'one', checked: false },
    { id: 'i-two', label: 'two', checked: false },
  ],
}
const omega: Block = { id: 'b-omega', type: 'text', content: 'omega' }

function Harness({ initial, onChange }: { initial: Block[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="walk"
      onChange={(next) => {
        onChange(next)
        setBlocks(next)
      }}
    />
  )
}

function renderCanvas(initial: Block[]) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const textBlockIn = (blockId: string) =>
  within(blockRoot(blockId)).findByRole('textbox', { name: 'text block' })

beforeEach(() => jest.clearAllMocks())

describe('PATH_STEPS — Esc selects, ↑/↓ walk the blocks, Return re-enters (KAN-367)', () => {
  it('↑ walks omega → checklist → alpha; Esc selects alpha with the ring; ↓ walks back to omega; Return re-enters it', async () => {
    const user = userEvent.setup()
    // jsdom has no layout: `posAtCoords` (the checklist → alpha landing) needs
    // a real one, same caveat `view.test.tsx:~404` stubs around for the press
    // landing, and `block-return.test.tsx`'s own text↔text ↑/↓ tests stub it.
    const posAtCoords = jest
      .spyOn(EditorView.prototype, 'posAtCoords')
      .mockReturnValue({ pos: 3, inside: -1 })
    renderCanvas([alpha, checklist, omega])

    // The caret is in omega, its only line.
    const omegaField = await textBlockIn('b-omega')
    act(() => {
      textEditorOf(omegaField).commands.focus('end')
    })
    await waitFor(() => expect(omegaField).toHaveFocus())
    textEditorOf(omegaField).view.endOfTextblock = () => true

    // ↑ leaves omega for the checklist's last item, 'two'.
    fireEvent.keyDown(omegaField, { key: 'ArrowUp' })
    const items = screen.getAllByRole('textbox', { name: 'Step' })
    await waitFor(() => expect(items[1]).toHaveFocus())
    expect(items[1]).toHaveValue('two')

    // ↑ steps within the checklist, to 'one'.
    fireEvent.keyDown(items[1], { key: 'ArrowUp' })
    await waitFor(() => expect(items[0]).toHaveFocus())
    expect(items[0]).toHaveValue('one')

    // ↑ on the first item leaves the checklist for alpha, landing in it.
    fireEvent.keyDown(items[0], { key: 'ArrowUp' })
    const alphaField = await textBlockIn('b-alpha')
    await waitFor(() => expect(alphaField).toHaveFocus())

    // Esc selects alpha's row, with the library's ring on its bare prose.
    await user.keyboard('{Escape}')
    const alphaRoot = blockRoot('b-alpha')
    await waitFor(() => expect(alphaRoot).toHaveFocus())
    const alphaProse = alphaRoot.querySelector('[data-part="prose"]')!
    expect(alphaProse).toHaveClass('ring-2', 'ring-mn-text', 'rounded-[20px]')

    // ↓ selects the checklist block (array order, not a field in it).
    await user.keyboard('{ArrowDown}')
    const checklistRoot = blockRoot('b-checklist')
    await waitFor(() => expect(checklistRoot).toHaveFocus())
    expect(checklistRoot.querySelector('[data-block-state]')).toHaveAttribute(
      'data-block-state',
      'selected'
    )

    // ↓ again selects omega.
    await user.keyboard('{ArrowDown}')
    const omegaRoot = blockRoot('b-omega')
    await waitFor(() => expect(omegaRoot).toHaveFocus())

    // Return re-enters omega, caret at its end.
    await user.keyboard('{Enter}')
    await waitFor(() => expect(omegaField).toHaveFocus())
    const { state } = textEditorOf(omegaField)
    expect(state.selection.from).toBe(state.doc.content.size - 1)
    posAtCoords.mockRestore()
  })
})
