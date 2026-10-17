/**
 * KAN-355 — the person's path on the real `BlockCanvas`: a checklist grows and
 * shrinks by hand. Every edge case has its own unit test in `todo-module.test.tsx`;
 * this proves the real block host wires through to them — middle-insert on Enter,
 * Backspace on a non-last empty item, and the quiet mouse add-row.
 */

import React from 'react'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { TodoBlock } from '@/lib/modules/todo/schema'
import { findAllTextBlocks, writeInTextBlock } from './helpers/text-block'

let initialSchema: PropertySchema = []
let initialRows: CollectionRow[] = []
const renameRow = jest.fn()
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [rows] = useState<CollectionRow[]>(initialRows)
    return {
      schema: initialSchema,
      rows,
      collectionName: 'Shop',
      isLoading: false,
      isError: false,
      setValue: jest.fn(),
      addRow: jest.fn(),
      removeRow: jest.fn(),
      renameRow,
      updateSchema: jest.fn(),
    }
  },
}))

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
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', parentId: null, blocks: [] }),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))
// A structural edit's own flush-around-the-edit (KAN-355) — observed directly
// rather than through `usePageDraft`'s real debounce, which this harness
// (unlike `DocumentPanel`) never mounts.
const flushPendingPageSave = jest.fn()
jest.mock('@/lib/pages/page-flush', () => ({
  ...jest.requireActual('@/lib/pages/page-flush'),
  // A plain property (rather than the identifier itself) would be read at
  // factory-run time — `BlockCanvas`'s own top-level import triggers that
  // BEFORE this file's `const` below has initialized. A closure defers the
  // read to call time, well after this module has finished loading.
  flushPendingPageSave: (...args: Parameters<typeof flushPendingPageSave>) =>
    flushPendingPageSave(...args),
}))

const chart: Block = { id: 'b-chart', type: 'view', mode: 'chart' }
const checklist: Block = {
  id: 'b-checklist',
  type: 'todo',
  items: [
    { id: 'i1', label: 'sand the top', checked: false },
    { id: 'i2', label: '', checked: false },
  ],
}

function Harness({ initial, onChange }: { initial: Block[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="workshop"
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

const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]

beforeEach(() => {
  jest.clearAllMocks()
  initialSchema = []
  initialRows = []
})

describe('KAN-355 — a checklist grows and shrinks by hand, on the real BlockCanvas', () => {
  it('/list ↵ and /checklist ↵ land the caret in the new item, not <body> (fix KAN-355, PATH step 1)', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty-1', type: 'text', content: '' }
    const emptyLine2: Block = { id: 'b-empty-2', type: 'text', content: '' }
    renderCanvas([emptyLine, emptyLine2])

    // `label` alone is ambiguous: `/list` also matches the premade `list`
    // template (same label, no key hint) — narrowed rows drop their group
    // headers entirely (`SlashMenu.tsx`), so the board's `-` row this ticket
    // means (`palette.ts`'s `bulleted-list`, `PondPicker`'s `-` row per
    // SPEC.md) is told apart by that key hint, kept alongside the label on
    // every unselected row.
    const blockRow = (menu: HTMLElement, label: string) =>
      within(menu)
        .getAllByRole('option')
        .find(
          (o) =>
            o.querySelector('[data-part="label"]')?.textContent === label &&
            (label !== 'list' || o.querySelector('[data-part="hint"]')?.textContent === '-')
        )!

    const pickRow = async (label: string) => {
      const [editor] = await findAllTextBlocks()
      writeInTextBlock(editor, '/')
      await screen.findByRole('listbox', { name: 'blocks' })
      writeInTextBlock(editor, `/${label}`)
      const menu = await screen.findByRole('listbox', { name: 'blocks' })
      await user.click(blockRow(menu, label))
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    }

    await pickRow('list')
    const listItem = await screen.findByRole('textbox', { name: 'Item' })
    await waitFor(() => expect(listItem).toHaveFocus())

    await pickRow('checklist')
    const stepItem = await screen.findByRole('textbox', { name: 'Step' })
    await waitFor(() => expect(stepItem).toHaveFocus())
  })

  it('Enter on the first (non-last) item inserts a new empty item directly below it, focused', async () => {
    const user = userEvent.setup()
    renderCanvas([checklist, chart])

    const items = screen.getAllByRole('textbox', { name: 'Step' })
    await user.click(items[0])
    await user.keyboard('{End}{Enter}')

    const after = await screen.findAllByRole('textbox', { name: 'Step' })
    expect(after).toHaveLength(3)
    expect(after[0]).toHaveValue('sand the top')
    expect(after[1]).toHaveValue('')
    await waitFor(() => expect(after[1]).toHaveFocus())
  })

  it('Backspace on an empty non-last item removes it and the previous item keeps caret at its end', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([checklist, chart])

    const items = screen.getAllByRole('textbox', { name: 'Step' })
    await user.click(items[0])
    await user.keyboard('{End}{Enter}')

    const grown = await screen.findAllByRole('textbox', { name: 'Step' })
    expect(grown).toHaveLength(3)
    await waitFor(() => expect(grown[1]).toHaveFocus())

    await user.keyboard('{Backspace}')

    const shrunk = await screen.findAllByRole('textbox', { name: 'Step' })
    expect(shrunk).toHaveLength(2)
    expect(shrunk[0]).toHaveValue('sand the top')
    await waitFor(() => expect(shrunk[0]).toHaveFocus())
    expect(shrunk[0]).toHaveProperty('selectionStart', 'sand the top'.length)
    expect(shrunk[0]).toHaveProperty('selectionEnd', 'sand the top'.length)

    const final = lastBlocks(onChange)
    expect(final[0]).toMatchObject({ items: [{ label: 'sand the top' }, { label: '' }] })
  })

  it('the quiet add-row is present and clicking it adds a new focused empty item', async () => {
    const user = userEvent.setup()
    renderCanvas([checklist, chart])

    const addRow = screen.getByRole('button', { name: '＋ add a step' })
    await user.click(addRow)

    const items = await screen.findAllByRole('textbox', { name: 'Step' })
    expect(items).toHaveLength(3)
    expect(items[2]).toHaveValue('')
    await waitFor(() => expect(items[2]).toHaveFocus())
  })

  it("the empty-state 'add a step' button adds an item and focuses it (fix KAN-355, PATH step 5→6)", async () => {
    const user = userEvent.setup()
    const singleStep: Block = {
      id: 'b-checklist-single',
      type: 'todo',
      items: [{ id: 'i1', label: '', checked: false }],
    }
    renderCanvas([singleStep, chart])

    const item = screen.getByRole('textbox', { name: 'Step' })
    await user.click(item)
    await user.keyboard('{Backspace}')

    const addRow = await screen.findByRole('button', { name: 'add a step' })
    await user.click(addRow)

    const newItem = await screen.findByRole('textbox', { name: 'Step' })
    await waitFor(() => expect(newItem).toHaveFocus())
  })

  it("the empty-state 'add a step' button flushes the pending save before and after its onChange, as its own record (fix KAN-355)", async () => {
    const user = userEvent.setup()
    const singleStep: Block = {
      id: 'b-checklist-single',
      type: 'todo',
      items: [{ id: 'i1', label: '', checked: false }],
    }
    renderCanvas([singleStep, chart])

    const item = screen.getByRole('textbox', { name: 'Step' })
    await user.click(item)
    await user.keyboard('{Backspace}')
    flushPendingPageSave.mockClear()

    const addRow = await screen.findByRole('button', { name: 'add a step' })
    await user.click(addRow)

    await waitFor(() => expect(flushPendingPageSave).toHaveBeenCalledTimes(2))
  })

  it('dragging an item reorders within the list and leaves the two blocks in place, one onChange (fix KAN-355)', async () => {
    const { onChange } = renderCanvas([checklist, chart])

    const wrappers = document.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!

    const dataTransfer = {
      store: {} as Record<string, string>,
      setData(k: string, v: string) {
        this.store[k] = v
      },
      getData(k: string) {
        return this.store[k] ?? ''
      },
    }

    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    fireEvent.drop(wrappers[1], { dataTransfer })

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next = lastBlocks(onChange)
    expect(next.map((b) => b.id)).toEqual(['b-checklist', 'b-chart'])
    expect((next[0] as TodoBlock).items.map((it) => it.label)).toEqual(['', 'sand the top'])
  })

  it('an item drag never leaks into the whole-block drag — releasing over the other block changes nothing (fix KAN-355)', async () => {
    const rect: DOMRect = {
      top: 0,
      left: 0,
      right: 300,
      bottom: 50,
      width: 300,
      height: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }
    const rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    const { onChange } = renderCanvas([checklist, chart])

    const wrappers = document.querySelectorAll<HTMLElement>('[data-item-id]')
    const handle = wrappers[0].querySelector<HTMLElement>('[data-part="handle"]')!
    const chartRow = document.querySelector('[data-block-id="b-chart"]')!

    const dataTransfer = {
      store: {} as Record<string, string>,
      setData(k: string, v: string) {
        this.store[k] = v
      },
      getData(k: string) {
        return this.store[k] ?? ''
      },
    }

    fireEvent.pointerDown(handle)
    fireEvent.dragStart(wrappers[0], { dataTransfer })
    // Hovers the OTHER block's bottom edge — before the fix, the item drag's
    // unstopped dragstart had already set `BlockCanvas`'s own `draggingIndex`
    // to the checklist's index, so this would arm a whole-block reorder.
    fireEvent.dragOver(chartRow, { dataTransfer, clientX: 150, clientY: 48 })
    fireEvent.drop(chartRow, { dataTransfer })

    expect(onChange).not.toHaveBeenCalled()
    rectSpy.mockRestore()
  })

  it('a structural edit flushes the pending save before and after itself, as its own record; typing alone never flushes (fix KAN-355)', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([checklist, chart])

    const items = screen.getAllByRole('textbox', { name: 'Step' })
    await user.click(items[0])
    await user.keyboard('{End}')
    await user.keyboard('x')
    expect(flushPendingPageSave).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(flushPendingPageSave).toHaveBeenCalledTimes(2)

    const addCallOrder = onChange.mock.invocationCallOrder.at(-1)!
    expect(flushPendingPageSave.mock.invocationCallOrder[0]).toBeLessThan(addCallOrder)
    expect(flushPendingPageSave.mock.invocationCallOrder[1]).toBeGreaterThan(addCallOrder)
  })
})
