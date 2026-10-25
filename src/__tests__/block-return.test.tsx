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
import { layoutRows } from '@/lib/modules/layout-rows'
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
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', parentId: null, blocks: [] }),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  // The bare-line Backspace remove (KAN-368) now writes through
  // `persistBlocksAsOwnEdit`, which calls these directly rather than the
  // debounced save this file otherwise exercises.
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))
const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
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

function Harness({
  initial,
  onChange,
  titleExitRef,
}: {
  initial: Block[]
  onChange: jest.Mock
  titleExitRef?: React.RefObject<(() => void) | null>
}) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <>
      {/* KAN-369: the title itself lives in DocumentPanel, outside BlockCanvas —
          stood in here, as `block-canvas-blank.test.tsx` does, only so a test
          has something real on the page; these tests drive `titleExitRef`
          directly rather than this stand-in's own (unwired) keydown. */}
      <textarea aria-label="title" data-pond-page-title />
      <BlockCanvas
        blocks={blocks}
        pageId="page-1"
        pageTitle="sourdough, 78%"
        onChange={(next) => {
          onChange(next)
          setBlocks(next)
        }}
        titleExitRef={titleExitRef}
      />
    </>
  )
}

function renderCanvas(initial: Block[], opts: { titleExitRef?: React.RefObject<(() => void) | null> } = {}) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} titleExitRef={opts.titleExitRef} />
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
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
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
    await waitFor(() => expect(lastBlocks(onChange)).toEqual([table, note]))
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
    await waitFor(() => expect(lastBlocks(onChange)).toEqual([note]))
    const above = await textBlockIn('b-note')
    await waitFor(() => expect(above).toHaveFocus())
    const { state } = textEditorOf(above)
    expect(state.selection.from).toBe(state.doc.content.size - 1)
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument()
  })

  it('Backspace in an empty first line removes it and goes to the end of the title (KAN-369)', async () => {
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
    await waitFor(() => expect(lastBlocks(onChange)).toEqual([table]))
    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())
  })

  it('Backspace in an empty LABELLED first line also goes to the title, not the neighbour (KAN-369)', async () => {
    const user = userEvent.setup()
    const labelledEmpty: Block = { id: 'b-empty-labelled', type: 'text', content: '', label: 'intro' }
    const { onChange } = renderCanvas([labelledEmpty, table])
    const line = await textBlockIn('b-empty-labelled')
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')
    await waitFor(() => expect(lastBlocks(onChange)).toEqual([table]))
    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())
    // A stale `focusNeighbour=true` lands here a tick later, via
    // `focusBlockNeighbour`'s own `setTimeout(0)` — give it that tick and
    // confirm the title still holds focus.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByLabelText('title')).toHaveFocus()
    expect(screen.queryByText('Delete this block?')).not.toBeInTheDocument()
  })

  it('Backspace in the only, empty block goes to the end of the title and keeps the block', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([emptyLine])
    const line = await textBlockIn('b-empty')
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')
    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByLabelText('title')).toHaveFocus())
  })

  it('leaving an empty block removes it and leaves focus where the person went', async () => {
    const { onChange } = renderCanvas([note, emptyLine])
    const line = await textBlockIn('b-empty')
    const above = await textBlockIn('b-note')
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    act(() => {
      textEditorOf(above).commands.focus('end')
    })

    await waitFor(() => expect(lastBlocks(onChange)).toEqual([note]))
    expect(above).toHaveFocus()
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument()
  })

  it('leaving the page’s only empty block keeps it', async () => {
    const { onChange } = renderCanvas([emptyLine])
    const line = await textBlockIn('b-empty')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    act(() => {
      outside.focus()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(blockRoot('b-empty')).toBeInTheDocument()
    outside.remove()
  })

  it('leaving a named empty block keeps it', async () => {
    const named: Block = { id: 'b-named', type: 'text', content: '', label: 'goal' }
    const { onChange } = renderCanvas([note, named])
    const line = await textBlockIn('b-named')
    const above = await textBlockIn('b-note')
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    act(() => {
      textEditorOf(above).commands.focus('end')
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(await textBlockIn('b-named')).toBeInTheDocument()
  })

  it('Backspace in an empty line hands rowStart to the row-mate it leaves behind (KAN-440)', async () => {
    const user = userEvent.setup()
    const c: Block = { id: 'b-c', type: 'text', content: 'c', width: '1/2', rowStart: true }
    const e: Block = { id: 'b-e', type: 'text', content: '', width: '1/2', rowStart: true }
    const b: Block = { id: 'b-b', type: 'text', content: 'b', width: '1/2' }
    const { onChange } = renderCanvas([c, e, b])
    const line = await textBlockIn('b-e')
    // KAN-345 rule 2: an empty line no longer takes focus on mount, so put the
    // caret in it the way a person clicking in would.
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')
    expect(lastBlocks(onChange)).toEqual([c, { ...b, rowStart: true }])
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

describe('Esc in a text block selects its row (KAN-367)', () => {
  it('Esc with the caret in text focuses the row, selected', async () => {
    const user = userEvent.setup()
    renderCanvas([note, table])
    const line = await textBlockIn('b-note')
    act(() => {
      textEditorOf(line).commands.focus('end')
    })
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Escape}')

    await waitFor(() => expect(blockRoot('b-note')).toHaveFocus())
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

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-note'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('↓ in the last row’s last cell opens a new line after the table', async () => {
    const { onChange } = renderCanvas([table, note])
    fireEvent.keyDown(screen.getByDisplayValue('Wall'), { key: 'ArrowDown' })

    await waitFor(() => expect(onChange).toHaveBeenCalled())
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

    await waitFor(() => expect(onChange).toHaveBeenCalled())
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
    // Separators are a block's own edge handle (KAN-441) or height handle
    // (KAN-442), never an inserter between blocks.
    const separators = screen.queryAllByRole('separator')
    expect(separators.length).toBeGreaterThan(0)
    separators.forEach((el) => {
      const isEdge = el.getAttribute('data-testid') === 'block-edge-handle'
      const isHeight = el.getAttribute('data-part') === 'height-handle'
      expect(isEdge || isHeight).toBe(true)
    })
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
    fireEvent.click(rowNamed(await screen.findByRole('listbox', { name: 'blocks' }), 'page'))

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

describe('Enter in a text block makes the next block', () => {
  const alpha: Block = { id: 'b-alpha', type: 'text', content: 'alpha beta' }

  it('at the end of the text makes a new empty block, focused, with its own handle', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([alpha])
    const field = await textBlockIn('b-alpha')
    act(() => {
      textEditorOf(field).commands.focus('end')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved).toEqual([alpha, { id: expect.any(String), type: 'text', content: '' }])
    const newId = saved[1].id
    expect(handleOf(newId)).toBeInTheDocument()
    const newField = await textBlockIn(newId)
    await waitFor(() => expect(newField).toHaveFocus())
  })

  it('in the middle of the text splits it: the second half is its own block, caret at its start', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([alpha])
    const field = await textBlockIn('b-alpha')
    act(() => {
      // Position 7: right after "alpha " (the trailing space stays with the
      // text before the caret — the split is exactly where it was cut).
      textEditorOf(field).commands.focus(7)
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved).toEqual([
      { id: 'b-alpha', type: 'text', content: 'alpha ' },
      { id: expect.any(String), type: 'text', content: 'beta' },
    ])
    const newField = await textBlockIn(saved[1].id)
    await waitFor(() => expect(newField).toHaveFocus())
    expect(textEditorOf(newField).state.selection.from).toBe(1)
  })

  it('at the start of non-empty text puts an empty block above, keeping the id/label and the caret', async () => {
    const user = userEvent.setup()
    const labelled: Block = { ...alpha, label: 'intro' }
    const { onChange } = renderCanvas([labelled])
    const field = await textBlockIn('b-alpha')
    act(() => {
      textEditorOf(field).commands.focus('start')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved).toEqual([{ id: expect.any(String), type: 'text', content: '' }, labelled])
    expect(saved[0].id).not.toBe('b-alpha')
    expect(field).toHaveFocus()
  })

  it('at the start of a labelled quote block: the empty block goes above, the quote keeps its id and label', async () => {
    const user = userEvent.setup()
    const quote: Block = { id: 'b-quote', type: 'text', content: '> alpha beta', label: 'said' }
    const { onChange } = renderCanvas([quote])
    const field = await textBlockIn('b-quote')
    act(() => {
      textEditorOf(field).commands.focus('start')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved).toEqual([{ id: expect.any(String), type: 'text', content: '' }, quote])
    expect(saved[0].id).not.toBe('b-quote')
    expect(field).toHaveFocus()
  })

  it('in a side-by-side row: the new block goes after the row, full width, and the row stays together', async () => {
    const user = userEvent.setup()
    const textHalf: Block = { id: 'b-text', type: 'text', content: 'gamma', width: '1/2', rowStart: true }
    const tableHalf: Block = { ...table, width: '1/2' }
    const { onChange } = renderCanvas([textHalf, tableHalf])
    const field = await textBlockIn('b-text')
    act(() => {
      textEditorOf(field).commands.focus('end')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved.map((b) => b.id)).toEqual(['b-text', 'b-table', expect.any(String)])
    expect(saved[2]).toMatchObject({ type: 'text', content: '', width: 'full' })
    expect(layoutRows(saved).map((row) => row.map((b) => b.id))).toEqual([
      ['b-text', 'b-table'],
      [saved[2].id],
    ])
  })

  it('in a side-by-side row, caret at the start of the FIRST member: the new block goes before the row, the row stays together', async () => {
    const user = userEvent.setup()
    const textHalf: Block = { id: 'b-text', type: 'text', content: 'gamma', width: '1/2', rowStart: true }
    const tableHalf: Block = { ...table, width: '1/2' }
    const { onChange } = renderCanvas([textHalf, tableHalf])
    const field = await textBlockIn('b-text')
    act(() => {
      textEditorOf(field).commands.focus('start')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved.map((b) => b.id)).toEqual([expect.any(String), 'b-text', 'b-table'])
    expect(saved[0]).toMatchObject({ type: 'text', content: '', width: 'full' })
    expect(layoutRows(saved).map((row) => row.map((b) => b.id))).toEqual([
      [saved[0].id],
      ['b-text', 'b-table'],
    ])
  })

  it('in a side-by-side row, caret at the start of the SECOND member: the new block goes before the row, not between its members', async () => {
    const user = userEvent.setup()
    const textFirst: Block = { id: 'b-first', type: 'text', content: 'gamma', width: '1/2', rowStart: true }
    const textSecond: Block = { id: 'b-second', type: 'text', content: 'delta', width: '1/2' }
    const { onChange } = renderCanvas([textFirst, textSecond])
    const field = await textBlockIn('b-second')
    act(() => {
      textEditorOf(field).commands.focus('start')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved.map((b) => b.id)).toEqual([expect.any(String), 'b-first', 'b-second'])
    expect(saved[0]).toMatchObject({ type: 'text', content: '', width: 'full' })
    expect(layoutRows(saved).map((row) => row.map((b) => b.id))).toEqual([
      [saved[0].id],
      ['b-first', 'b-second'],
    ])
  })

  it('Enter on an empty FIRST list item: the list keeps the rest, a new empty block goes above, focused', async () => {
    const user = userEvent.setup()
    const list: Block = { id: 'b-list', type: 'text', content: '- \n- two' }
    const { onChange } = renderCanvas([list])
    const field = await textBlockIn('b-list')
    act(() => {
      textEditorOf(field).commands.focus('start')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    const saved = lastBlocks(onChange)
    expect(saved.map((b) => b.id)).toEqual([expect.any(String), 'b-list'])
    expect(saved[0]).toMatchObject({ type: 'text', content: '' })
    expect(saved[1]).toMatchObject({ type: 'text', content: expect.stringContaining('two') })
    const newField = await textBlockIn(saved[0].id)
    await waitFor(() => expect(newField).toHaveFocus())
  })

  it('on an empty, unlabelled block does nothing: one action, one write', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([emptyLine])
    const field = await textBlockIn('b-empty')
    act(() => {
      textEditorOf(field).commands.focus('end')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    expect(field).toHaveFocus()
  })

  it('Backspace right after Enter takes the new empty block back out, caret at the end of the text', async () => {
    const user = userEvent.setup()
    const solo: Block = { id: 'b-solo', type: 'text', content: 'alpha' }
    const { onChange } = renderCanvas([solo])
    const field = await textBlockIn('b-solo')
    act(() => {
      textEditorOf(field).commands.focus('end')
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')
    const newId = lastBlocks(onChange)[1].id
    const newField = await textBlockIn(newId)
    await waitFor(() => expect(newField).toHaveFocus())

    await user.keyboard('{Backspace}')

    await waitFor(() => expect(lastBlocks(onChange)).toEqual([solo]))
    const above = await textBlockIn('b-solo')
    await waitFor(() => expect(above).toHaveFocus())
    const { state } = textEditorOf(above)
    expect(state.selection.from).toBe(state.doc.content.size - 1)
  })
})

describe('Return/↓ from the title goes to the body (KAN-369)', () => {
  it('a text-first page focuses the start', async () => {
    const titleExitRef = React.createRef<(() => void) | null>()
    const { onChange } = renderCanvas([note, table], { titleExitRef })
    const field = await textBlockIn('b-note')

    act(() => {
      titleExitRef.current?.()
    })

    await waitFor(() => expect(field).toHaveFocus())
    expect(textEditorOf(field).state.selection.from).toBe(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a card-first page gets [empty, table] and the line has focus', async () => {
    const titleExitRef = React.createRef<(() => void) | null>()
    const { onChange } = renderCanvas([table], { titleExitRef })

    act(() => {
      titleExitRef.current?.()
    })

    const saved = lastBlocks(onChange)
    expect(saved.map((b) => b.type)).toEqual(['text', 'table'])
    expect(saved[1]).toEqual(table)
    const line = await textBlockIn(saved[0].id)
    await waitFor(() => expect(line).toHaveFocus())
  })

  it('an untouched inserted line, then blur, is removed (existing removeEmptyOnExit)', async () => {
    const titleExitRef = React.createRef<(() => void) | null>()
    const { onChange } = renderCanvas([table], { titleExitRef })

    act(() => {
      titleExitRef.current?.()
    })
    const line = await textBlockIn(lastBlocks(onChange)[0].id)
    await waitFor(() => expect(line).toHaveFocus())

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    act(() => {
      outside.focus()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await waitFor(() => expect(lastBlocks(onChange)).toEqual([table]))
    outside.remove()
  })
})
