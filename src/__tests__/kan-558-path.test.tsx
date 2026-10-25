/**
 * KAN-558's own PATH_STEPS, walked on the real `BlockCanvas`: `/checklist` and
 * `/grid` (the freeform table's own row, KAN-240 — `/table` itself opens the
 * source picker and mints no block directly) each land a block that stays on
 * the page once focus leaves it empty, unlike a bare text line (KAN-345). The
 * minted checklist still holds one unwritten item, so it sits in `PondBlock`'s
 * `rest` state (board 06.07's row, "+ add a step"), never the big empty-box
 * action `blockIsEmpty` would otherwise gate on an item count of zero.
 */

import React from 'react'
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { textEditorOf, writeInTextBlock } from './helpers/text-block'

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

function Harness({ initial, onChange }: { initial: Block[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
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
const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

beforeEach(() => {
  jest.clearAllMocks()
  onPlatform('MacIntel')
})
afterEach(() => jest.restoreAllMocks())

describe('KAN-558 — only an empty text line is removed on exit', () => {
  it('an empty checklist and an empty table stay when focus leaves them empty; an empty text line goes', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyA: Block = { id: 'b-empty-a', type: 'text', content: '' }
    const emptyB: Block = { id: 'b-empty-b', type: 'text', content: '' }
    const emptyC: Block = { id: 'b-empty-c', type: 'text', content: '' }
    const { onChange } = renderCanvas([note, emptyA, emptyB, emptyC])

    // `/checklist` lands a `todo` block in b-empty-a's place.
    const fieldA = await textBlockIn('b-empty-a')
    writeInTextBlock(fieldA, '/')
    const slashMenu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(slashMenu).getByText('checklist'))
    await waitFor(() => expect(lastBlocks(onChange)[1].type).toBe('todo'), { timeout: 3000 })
    const checklistId = lastBlocks(onChange)[1].id
    await screen.findByRole('textbox', { name: 'Step' })
    const addStep = screen.getByRole('button', { name: '＋ add a step' })

    // Click elsewhere on the page — the note's own line — and the checklist stays.
    const noteField = await textBlockIn('b-note')
    act(() => {
      textEditorOf(noteField).commands.focus('end')
    })
    await waitFor(() => expect(noteField).toHaveFocus())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(document.getElementById(`block-${checklistId}`)).toBeInTheDocument()
    expect(addStep).toBeInTheDocument()
    expect(lastBlocks(onChange).some((b) => b.type === 'todo')).toBe(true)

    // `/grid` lands a freeform `table` block in b-empty-b's place (KAN-240 —
    // never `/table`, which asks which database first and mints no block here).
    const fieldB = await textBlockIn('b-empty-b')
    writeInTextBlock(fieldB, '/')
    const gridMenu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(gridMenu).getByText('grid'))
    await waitFor(() => expect(lastBlocks(onChange)[2].type).toBe('table'), { timeout: 3000 })
    const tableId = lastBlocks(onChange)[2].id
    await screen.findByText('Column 1')

    act(() => {
      textEditorOf(noteField).commands.focus('end')
    })
    await waitFor(() => expect(noteField).toHaveFocus())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(document.getElementById(`block-${tableId}`)).toBeInTheDocument()
    expect(screen.getByText('Column 1')).toBeInTheDocument()
    expect(lastBlocks(onChange).some((b) => b.type === 'table')).toBe(true)

    // An untouched empty text line is still removed on exit (KAN-345/21dd357d).
    const fieldC = await textBlockIn('b-empty-c')
    act(() => {
      textEditorOf(fieldC).commands.focus('end')
    })
    await waitFor(() => expect(fieldC).toHaveFocus())
    act(() => {
      textEditorOf(noteField).commands.focus('end')
    })
    await waitFor(() => expect(noteField).toHaveFocus())
    await waitFor(() => expect(lastBlocks(onChange).some((b) => b.id === 'b-empty-c')).toBe(false))
  })

  it('⌘⌫ on the selected empty checklist deletes it with no confirm dialog', async () => {
    const user = userEvent.setup()
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const checklist: Block = {
      id: 'b-checklist',
      type: 'todo',
      items: [{ id: 'i1', label: '', checked: false }],
    }
    const { onChange } = renderCanvas([kept, checklist])

    const row = blockRoot('b-checklist')
    row.focus()
    await waitFor(() => expect(row).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')

    await waitFor(() => expect(lastBlocks(onChange)).toEqual([kept]))
    expect(screen.queryByText('Delete this block?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(await screen.findByText(/^deleted .+ ·$/)).toBeInTheDocument()
  })
})
