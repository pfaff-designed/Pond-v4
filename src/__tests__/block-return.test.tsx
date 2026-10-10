/**
 * Adding a block mid-page (`Pond 07.05 Blocks`, storyboard 6g frame 1): "Return
 * after the table, then /". Return on a focused block — the block itself, never
 * an editor inside it — opens an empty line after it, and `/` there is the
 * ordinary `/` menu. `/` at the start of an empty line inside a text block opens
 * the same menu and, on a pick, splits the block at that line. The handle is the
 * only block chrome: no `+` between blocks.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const mockCreatePage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', parentId: null, blocks: [] }),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

const table: Block = {
  id: 'b-table',
  type: 'table',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
}
const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
const prose: Block = { id: 'b-prose', type: 'text', content: 'soak overnight\n\nsimmer with bay' }

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
      onUndoRemove={() => {}}
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
const handleOf = (blockId: string) =>
  within(blockRoot(blockId)).getByRole('button', { name: /block menu/i })
const textBlockIn = (blockId: string) =>
  within(blockRoot(blockId)).findByRole('textbox', { name: 'text block' })
const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]
const rowNamed = (menu: HTMLElement, name: string) =>
  within(menu)
    .getAllByRole('option')
    .find((o) => o.querySelector('[data-part="label"]')?.textContent === name)!

beforeEach(() => {
  jest.clearAllMocks()
})

describe('Return after a block opens a line for `/` (6g frame 1)', () => {
  it('Return after the table, then `/`', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([table, note])
    blockRoot('b-table').focus()
    await user.keyboard('{Enter}')

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-note'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
    const line = await textBlockIn(opened[1].id)
    await waitFor(() => expect(line).toHaveFocus())

    writeInTextBlock(line, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(rowNamed(menu, 'checklist'))

    const placed = lastBlocks(onChange)
    expect(placed.map((b) => b.type)).toEqual(['table', 'todo', 'text'])
    expect(placed[0]).toEqual(table)
    expect(placed[2]).toEqual(note)
  })

  it('Return inside the table’s own cells stays the table’s', async () => {
    const { onChange } = renderCanvas([table, note])
    fireEvent.keyDown(await screen.findByDisplayValue('Saw'), { key: 'Enter' })
    expect(onChange.mock.calls.some(([next]) => (next as Block[]).length !== 2)).toBe(false)
  })

  it('Return on a text block’s frame opens nothing: its Return belongs to its editor', async () => {
    const { onChange } = renderCanvas([note, table])
    blockRoot('b-note').focus()
    fireEvent.keyDown(blockRoot('b-note'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a modified Return opens nothing', async () => {
    const { onChange } = renderCanvas([table])
    blockRoot('b-table').focus()
    fireEvent.keyDown(blockRoot('b-table'), { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-table'), { key: 'Enter', metaKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Backspace in the fresh line takes it back out and returns to the block it came from', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([table, note])
    blockRoot('b-table').focus()
    await user.keyboard('{Enter}')
    const line = await textBlockIn(lastBlocks(onChange)[1].id)
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')
    expect(lastBlocks(onChange)).toEqual([table, note])
    await waitFor(() => expect(blockRoot('b-table')).toHaveFocus())
  })

  it('a non-text block is a tab stop; a text block’s focus is its editor', () => {
    renderCanvas([table, note])
    expect(blockRoot('b-table')).toHaveAttribute('tabindex', '0')
    expect(blockRoot('b-note')).toHaveAttribute('tabindex', '-1')
  })
})

describe('the handle is the only block chrome (07.05)', () => {
  it('draws no `+` separator between blocks', () => {
    renderCanvas([table, note, prose])
    expect(screen.queryByRole('button', { name: 'Insert block' })).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('sits at the block’s left edge as PondBlock draws it: 12×24 at left −14, top 12, ink 68', () => {
    renderCanvas([table])
    const handle = handleOf('b-table')
    const box = handle.closest('[data-part="handle"]')!
    expect(box).toHaveClass('absolute', '-left-3.5', 'top-3')
    expect(handle).toHaveClass(
      'flex',
      'h-6',
      'w-3',
      'items-center',
      'justify-center',
      'rounded-[6px]',
      'text-mn-text-secondary'
    )
    const glyph = handle.querySelector('svg')!
    expect(glyph).toHaveAttribute('width', '10')
    expect(glyph).toHaveAttribute('height', '14')
    expect(glyph).toHaveAttribute('fill', 'currentColor')
    const dots = Array.from(glyph.querySelectorAll('circle'), (c) =>
      ['cx', 'cy', 'r'].map((a) => c.getAttribute(a)).join(' ')
    )
    expect(dots).toEqual(['3 3 1.1', '7 3 1.1', '3 7 1.1', '7 7 1.1', '3 11 1.1', '7 11 1.1'])
  })

  it('is hidden at rest and shows on block hover or keyboard focus', () => {
    renderCanvas([table])
    const box = handleOf('b-table').closest('[data-part="handle"]')!
    expect(box).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100'
    )
  })

  it('open, it is ink 100 on the hover wash and stays shown', async () => {
    const user = userEvent.setup()
    renderCanvas([table])
    await user.click(handleOf('b-table'))
    await screen.findByRole('menu', { name: /block menu/i })
    expect(handleOf('b-table')).toHaveClass('text-mn-text', 'bg-mn-hover-fill')
    expect(handleOf('b-table')).not.toHaveClass('text-mn-text-secondary')
    expect(handleOf('b-table').closest('[data-part="handle"]')).toHaveClass('opacity-100')
  })
})

describe('`/` on an empty line inside a text block splits it at that line', () => {
  /** A new empty line after "soak overnight", then `/` typed on it. */
  async function slashAfterFirstLine() {
    const editor = textEditorOf(await textBlockIn('b-prose'))
    act(() => {
      editor.chain().focus(15).splitBlock().run()
    })
    act(() => {
      editor.commands.insertContent('/')
    })
    return editor
  }

  it('opens the `/` menu, and a pick lands between the two halves as one change', async () => {
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const before = onChange.mock.calls.length
    fireEvent.click(rowNamed(menu, 'checklist'))

    expect(onChange).toHaveBeenCalledTimes(before + 1)
    expect(lastBlocks(onChange)).toEqual([
      { id: 'b-prose', type: 'text', content: 'soak overnight' },
      expect.objectContaining({ type: 'todo' }),
      { id: expect.any(String), type: 'text', content: 'simmer with bay' },
    ])
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    await waitFor(async () =>
      expect(await textBlockIn('b-prose')).toHaveTextContent(/^soak overnight$/)
    )
  })

  it('the menu’s query is what follows the slash on that line', async () => {
    renderCanvas([prose])
    const editor = await slashAfterFirstLine()
    await screen.findByRole('listbox', { name: 'blocks' })
    act(() => {
      editor.commands.insertContent('check')
    })
    await waitFor(() => {
      const menu = screen.getByRole('listbox', { name: 'blocks' })
      expect(rowNamed(menu, 'checklist')).toBeDefined()
      expect(rowNamed(menu, 'heading')).toBeUndefined()
    })
  })

  it('Escape closes the menu and keeps the `/` line as text', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    await screen.findByRole('listbox', { name: 'blocks' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(lastBlocks(onChange)).toEqual([
      { ...prose, content: 'soak overnight\n\n/\n\nsimmer with bay' },
    ])
  })

  it('deleting the slash closes the menu', async () => {
    renderCanvas([prose])
    const editor = await slashAfterFirstLine()
    await screen.findByRole('listbox', { name: 'blocks' })
    act(() => {
      const at = editor.state.selection.from
      editor.commands.deleteRange({ from: at - 1, to: at })
    })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('a `/` typed after text on a line opens nothing', async () => {
    renderCanvas([prose])
    const editor = textEditorOf(await textBlockIn('b-prose'))
    act(() => {
      editor.chain().focus(15).insertContent('/').run()
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('`/table` splits the block and hangs the source picker off the `/` line', async () => {
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'table'))

    expect(await screen.findByRole('listbox', { name: '/table' })).toBeInTheDocument()
    expect(lastBlocks(onChange)).toEqual([
      { id: 'b-prose', type: 'text', content: 'soak overnight' },
      { id: expect.any(String), type: 'text', content: '/' },
      { id: expect.any(String), type: 'text', content: 'simmer with bay' },
    ])
  })

  it('a `page` pick removes only the `/` line, never the text around it', async () => {
    mockCreatePage.mockResolvedValue({ id: 'new-page', title: 'untitled', type: 'page' })
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'nested page'))

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalled())
    await waitFor(() =>
      expect(lastBlocks(onChange)).toEqual([
        { id: 'b-prose', type: 'text', content: 'soak overnight' },
        { id: expect.any(String), type: 'text', content: 'simmer with bay' },
      ])
    )
  })
})
