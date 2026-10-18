/**
 * Adding a block mid-page: "Return after the table, then /". Return on a focused block — the block itself, never
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
import { PageCanvas } from '@/lib/modules/page-canvas'
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
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: [
      {
        id: 'p-status',
        name: 'status',
        type: 'status',
        options: [{ id: 'o-todo', label: 'to do' }],
      },
    ],
    rows: [{ id: 'row-1', title: 'Trim the rim', values: { 'p-status': 'o-todo' } }],
    isLoading: false,
    isError: false,
    setValue: jest.fn(),
    addRow: jest.fn(),
    removeRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
  }),
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
const image: Block = {
  id: 'b-image',
  type: 'image',
  url: 'https://cdn.example/user-1/board.png',
  filename: 'board.png',
}
const checklist: Block = {
  id: 'b-checklist',
  type: 'todo',
  items: [{ id: 'i1', label: 'sand the top', checked: false }],
}
const board: Block = { id: 'b-board', type: 'view', mode: 'board', groupBy: 'p-status' }
const checklistWithEmptyLastItem: Block = {
  id: 'b-checklist',
  type: 'todo',
  items: [
    { id: 'i1', label: 'sand the top', checked: false },
    { id: 'i2', label: '', checked: false },
  ],
}
const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
const prose: Block = { id: 'b-prose', type: 'text', content: 'soak overnight\n\nsimmer with bay' }
const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
const withSlashLine = { ...prose, content: 'soak overnight\n\n/\n\nsimmer with bay' }
/** The pond's databases root and one database in it, as `fetchPages` lists them. */
const databaseRows = [
  { id: 'root', parent_id: null, type: 'page', title: 'databases', order: 0, updated_at: '' },
  {
    id: 'db-recipes',
    parent_id: 'root',
    type: 'database',
    title: 'recipes',
    order: 0,
    updated_at: '',
  },
]

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
  mockFetchPages.mockResolvedValue([])
})

describe('Return after a block opens a line for `/`', () => {
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
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument()
  })

  it('Backspace in an empty line under text puts the caret at the end of that text, with nothing to undo', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([note, emptyLine])
    const line = await textBlockIn('b-empty')
    // KAN-345 rule 2: an empty line that merely arrived with the page never
    // autofocuses on its own — this test is Backspace's, not autofocus's, so
    // it puts the caret there itself, the way a person clicking in would.
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')
    expect(lastBlocks(onChange)).toEqual([note])
    const above = await textBlockIn('b-note')
    await waitFor(() => expect(above).toHaveFocus())
    const { state } = textEditorOf(above)
    expect(state.selection.from).toBe(state.doc.content.size - 1)
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument()
  })

  it('Backspace in an empty first line hands focus to the block after it, never the page', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([emptyLine, table])
    const line = await textBlockIn('b-empty')
    // KAN-345 rule 2: see the note above — this test's own setup puts the
    // caret in the line itself, same as a person clicking in would.
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')
    expect(lastBlocks(onChange)).toEqual([table])
    await waitFor(() => expect(blockRoot('b-table')).toHaveFocus())
  })

  it('a non-text block is a tab stop; a text block’s focus is its editor', () => {
    renderCanvas([table, note])
    expect(blockRoot('b-table')).toHaveAttribute('tabindex', '0')
    expect(blockRoot('b-note')).toHaveAttribute('tabindex', '-1')
  })

  it('a non-text block is a named group that says Return opens a line, and shows PondBlock’s own selected state on focus', () => {
    renderCanvas([table, note])
    const group = screen.getByRole('group', { name: 'table' })
    expect(group).toBe(blockRoot('b-table'))
    expect(group).toHaveAttribute('aria-keyshortcuts', 'Enter')
    expect(group.querySelector('[data-block-state]')).toHaveAttribute('data-block-state', 'rest')
    act(() => group.focus())
    expect(group.querySelector('[data-block-state]')).toHaveAttribute(
      'data-block-state',
      'selected'
    )
    expect(blockRoot('b-note')).not.toHaveAttribute('role')
  })
})

describe('pointer selection draws PondBlock’s own `selected` state (07.05)', () => {
  it('a click on the table card’s own padding selects the row; Esc clears it; the cell keeps its own focus', async () => {
    const user = userEvent.setup()
    renderCanvas([table, note])
    const group = blockRoot('b-table')
    const card = group.querySelector('[data-block-state]')!

    await user.click(group)
    expect(card).toHaveAttribute('data-block-state', 'selected')
    await waitFor(() => expect(group).toHaveFocus())

    await user.keyboard('{Escape}')
    expect(card).toHaveAttribute('data-block-state', 'rest')
    await waitFor(() => expect(group).not.toHaveFocus())

    await user.click(screen.getByDisplayValue('Saw'))
    expect(card).toHaveAttribute('data-block-state', 'rest')
    expect(screen.getByDisplayValue('Saw')).toHaveFocus()
  })

  it('a click inside RecordPeek — portaled to the page canvas, outside the row’s own DOM — does not select the row', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DeletionUndoProvider>
          <PageCanvas>
            <Harness initial={[board]} onChange={jest.fn()} />
          </PageCanvas>
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const group = blockRoot('b-board')

    // Open the peek from the keyboard, never a click on the row — isolates the
    // portal's own click from the row's click handler.
    screen.getByRole('article', { name: 'Trim the rim' }).focus()
    await user.keyboard('{Enter}')
    const peek = document.querySelector('[data-part="record-peek"]') as HTMLElement
    expect(group.contains(peek)).toBe(false)

    await user.click(within(peek).getByText('status'))

    expect(group).not.toHaveFocus()
    expect(document.querySelector('[data-part="record-peek"]')).not.toBeNull()
  })
})

describe('↓ on a selected row steps out, same as Return (KAN-344)', () => {
  it('↓ on a focused image block opens a new line after it', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([image, note])
    blockRoot('b-image').focus()
    await user.keyboard('{ArrowDown}')

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-image', expect.any(String), 'b-note'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('↓ on a focused table row does nothing: the table reads ↓ itself', async () => {
    const { onChange } = renderCanvas([table, note])
    fireEvent.keyDown(blockRoot('b-table'), { key: 'ArrowDown' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('↓ on a focused checklist row does nothing: the checklist reads ↓ itself', async () => {
    const { onChange } = renderCanvas([checklist, note])
    fireEvent.keyDown(blockRoot('b-checklist'), { key: 'ArrowDown' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the table’s last cell steps out, same as Return (KAN-344)', () => {
  it('Return in the last row’s last cell opens a new line after the table', async () => {
    const { onChange } = renderCanvas([table, note])
    fireEvent.keyDown(screen.getByDisplayValue('Wall'), { key: 'Enter' })

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-note'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('↓ in the last row’s last cell opens a new line after the table', async () => {
    const { onChange } = renderCanvas([table, note])
    fireEvent.keyDown(screen.getByDisplayValue('Wall'), { key: 'ArrowDown' })

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-note'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('Return in “Saw” (not the last cell) still does nothing', async () => {
    const { onChange } = renderCanvas([table, note])
    fireEvent.keyDown(await screen.findByDisplayValue('Saw'), { key: 'Enter' })
    expect(onChange.mock.calls.some(([next]) => (next as Block[]).length !== 2)).toBe(false)
  })
})

describe('the checklist’s empty last item steps out, same as Return (KAN-344)', () => {
  it('Return on the empty last item removes it and opens a new line after the checklist', async () => {
    const { onChange } = renderCanvas([checklistWithEmptyLastItem, note])
    const items = screen.getAllByRole('textbox', { name: 'Step' })
    fireEvent.keyDown(items[1], { key: 'Enter' })

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-checklist', expect.any(String), 'b-note'])
    expect(opened[0]).toMatchObject({ items: [{ label: 'sand the top' }] })
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('Return on a non-empty, not-last item inserts a new empty item directly below it (KAN-355)', async () => {
    const { onChange } = renderCanvas([checklistWithEmptyLastItem, note])
    const items = screen.getAllByRole('textbox', { name: 'Step' })
    fireEvent.keyDown(items[0], { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Block[]
    expect(next.map((b) => b.id)).toEqual(['b-checklist', 'b-note'])
    expect(next[0]).toMatchObject({
      items: [{ label: 'sand the top' }, { label: '' }, { label: '' }],
    })
  })

  it('Return on the single, non-empty, last item appends an empty item instead of stepping out', async () => {
    const { onChange } = renderCanvas([checklist, note])
    const item = screen.getByRole('textbox', { name: 'Step' })
    fireEvent.keyDown(item, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Block[]
    expect(next.map((b) => b.id)).toEqual(['b-checklist', 'b-note'])
    expect(next[0]).toMatchObject({
      items: [{ label: 'sand the top' }, { label: '' }],
    })
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

  it('centres on a text block’s first line, which has no card head row to align with', () => {
    renderCanvas([note])
    const box = handleOf('b-note').closest('[data-part="handle"]')!
    expect(box).toHaveClass('absolute', '-left-3.5', 'top-1')
    expect(box).not.toHaveClass('top-3')
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

  /** The `/` line's paragraph, placed at a known spot on screen. */
  const placeSlashLine = (editor: ReturnType<typeof textEditorOf>) => {
    const element = editor.view.nodeDOM(editor.state.selection.$from.before(1)) as HTMLElement
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top: 300,
      bottom: 320,
      left: 40,
      right: 400,
      width: 360,
      height: 20,
      x: 40,
      y: 300,
      toJSON: () => ({}),
    })
  }

  it('`/table` hangs the source picker off the `/` line and leaves the block whole while it is open', async () => {
    const { onChange } = renderCanvas([prose])
    placeSlashLine(await slashAfterFirstLine())
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'table'))

    const picker = await screen.findByRole('listbox', { name: '/table' })
    expect(picker.closest('[data-part="glass"]')).toHaveStyle({ top: '324px', left: '40px' })
    expect(lastBlocks(onChange)).toEqual([withSlashLine])
  })

  it('a source picker closed without a pick leaves the block as it was', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'table'))
    await screen.findByRole('listbox', { name: '/table' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(onChange.mock.calls.every(([next]) => (next as Block[]).length === 1)).toBe(true)
    expect(lastBlocks(onChange)).toEqual([withSlashLine])
  })

  it('picking a database lands its view between the two halves', async () => {
    mockFetchPages.mockResolvedValue(databaseRows)
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'table'))
    const picker = await screen.findByRole('listbox', { name: '/table' })

    fireEvent.click(await within(picker).findByRole('option', { name: /recipes/ }))
    await waitFor(() =>
      expect(lastBlocks(onChange)).toEqual([
        { id: 'b-prose', type: 'text', content: 'soak overnight' },
        expect.objectContaining({ type: 'view', mode: 'table', collectionId: 'db-recipes' }),
        { id: expect.any(String), type: 'text', content: 'simmer with bay' },
      ])
    )
  })

  it('a template pick whose page cannot be made leaves the block as it was', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockCreatePage.mockRejectedValue(new Error('offline'))
    const { onChange } = renderCanvas([prose])
    await slashAfterFirstLine()
    fireEvent.click(
      rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'page from template')
    )
    fireEvent.click(
      rowNamed(await screen.findByRole('listbox', { name: 'page from template' }), 'notes')
    )

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Failed to make the page', expect.any(Error))
    )
    expect(lastBlocks(onChange)).toEqual([withSlashLine])
    error.mockRestore()
  })

  it('a labelled block keeps its label on the text above the pick', async () => {
    const { onChange } = renderCanvas([{ ...prose, label: 'method' }])
    await slashAfterFirstLine()
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'checklist'))

    expect(lastBlocks(onChange)).toEqual([
      { id: 'b-prose', type: 'text', content: 'soak overnight', label: 'method' },
      expect.objectContaining({ type: 'todo' }),
      { id: expect.any(String), type: 'text', content: 'simmer with bay' },
    ])
  })

  it('a `nested page` pick leaves a page link where the `/` line was (KAN-122)', async () => {
    mockCreatePage.mockResolvedValue({ id: 'new-page', title: 'untitled', type: 'page' })
    const { onChange } = renderCanvas([{ ...prose, label: 'method' }])
    await slashAfterFirstLine()
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'nested page'))

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalled())
    await waitFor(() =>
      expect(lastBlocks(onChange)).toEqual([
        { id: 'b-prose', type: 'text', content: 'soak overnight', label: 'method' },
        expect.objectContaining({ type: 'page-link', pageId: 'new-page' }),
        { id: expect.any(String), type: 'text', content: 'simmer with bay' },
      ])
    )
  })
})
