/**
 * The block menu on the page: the handle — or ⌘/ (Ctrl+/ off Apple) on a
 * focused block — opens `PondMenu` kind `block`, which offers the conversions
 * that keep the content, `copy link to block` and `delete`. While it is open the
 * block wears the open ring; closing it puts focus back where the person was —
 * on the handle, or inside the block for ⌘/. Every conversion is
 * the person's own edit: it applies in place at once, with an undo. Turning a
 * list into a table writes a real database (mocked here; the pure list helpers
 * stay real so the preview count is genuine). Arriving at a block's link
 * scrolls to and focuses that block.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { blockWidthStyle } from '@/lib/modules/layout-rows'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockDeletePage = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
}))

const view = { id: 'v-1', type: 'view', mode: 'table', collectionId: 'db-1' }
const mockCreateDatabaseFromList = jest.fn().mockResolvedValue({
  view,
  databaseId: 'db-1',
  databasesRootId: 'root-db',
  rowCount: 4,
  schema: [],
})
jest.mock('@/lib/pages/list-to-table', () => ({
  ...jest.requireActual('@/lib/pages/list-to-table'),
  createDatabaseFromList: (...args: unknown[]) => mockCreateDatabaseFromList(...args),
}))

const heading: Block = { id: 'b-heading', type: 'text', content: '## ingredients' }
const list: Block = {
  id: 'b-list',
  type: 'text',
  content: '- 500g strong white flour\n- 350g water\n- 100g levain\n- 10g salt',
}
const shopping: Block = {
  id: 'b-shop',
  type: 'todo',
  marker: 'dot',
  label: 'shopping',
  items: [
    { id: 'i1', label: '2 eggs', checked: false },
    { id: 'i2', label: '3 apples', checked: false },
    { id: 'i3', label: '1 lemon', checked: false },
  ],
}
const table: Block = {
  id: 'b-table',
  type: 'table',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
}

/** Ink at .18 in light, paper at .18 in dark — one value that flips with the theme. */
const OPEN_RING = '[box-shadow:0_0_0_2px_rgb(from_var(--mn-text)_r_g_b/0.18)]'

interface HarnessProps {
  initial: Block[]
  onChange: jest.Mock
  onMoveIntoNewPage?: (block: Block) => void
}

function Harness({ initial, onChange, onMoveIntoNewPage }: HarnessProps) {
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
      onMoveIntoNewPage={onMoveIntoNewPage}
    />
  )
}

function renderCanvas(initial: Block[], onMoveIntoNewPage?: (block: Block) => void) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} onMoveIntoNewPage={onMoveIntoNewPage} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const handleOf = (blockId: string) =>
  within(document.getElementById(`block-${blockId}`)!).getByRole('button', {
    name: /block menu/i,
  })

const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]

/** jsdom's CSSStyleDeclaration reorders a `calc()`, so compare normalized values. */
function normalizedWidth(value: string) {
  const probe = document.createElement('div')
  probe.style.width = value
  return probe.style.width
}

const scrollIntoView = jest.mocked(HTMLElement.prototype.scrollIntoView)

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('the block menu opens from the handle', () => {
  it('offers the conversions that keep a list’s content, then the block’s own actions', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    await user.click(handleOf('b-list'))

    const menu = await screen.findByRole('menu', { name: /block menu/i })
    const turnInto = within(menu).getByRole('group', { name: 'turn into' })
    expect(
      within(turnInto)
        .getAllByRole('menuitem')
        .map((i) => i.textContent)
    ).toEqual(['table4 rows · 3 columns', 'list', 'checklist'])
    const block = within(menu).getByRole('group', { name: 'block' })
    expect(
      within(block)
        .getAllByRole('menuitem')
        .map((i) => i.textContent)
    ).toEqual(['copy link to block', 'delete'])
  })

  it('offers no `turn into` on a block with no content-keeping target', async () => {
    const user = userEvent.setup()
    renderCanvas([table])
    await user.click(handleOf('b-table'))
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    expect(within(menu).queryByText('turn into')).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'delete' })).toBeInTheDocument()
  })

  it('rings the block while the menu is open, and drops the ring when it closes', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const root = document.getElementById('block-b-list')!
    expect(root.className).not.toContain(OPEN_RING)

    await user.click(handleOf('b-list'))
    await screen.findByRole('menu', { name: /block menu/i })
    expect(root.className).toContain(OPEN_RING)
    expect(root.className).toContain('rounded-[20px]')
    expect(root.className).not.toMatch(/dark:/)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(root.className).not.toContain(OPEN_RING)
  })

  it('opened from the handle, closing hands focus back to the handle', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    handleOf('b-list').focus()
    await user.keyboard('{Enter}')
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    await waitFor(() => expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(handleOf('b-list')).toHaveFocus())
  })

  it('a drag from the handle closes the menu its press opened', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    await user.click(handleOf('b-list'))
    await screen.findByRole('menu', { name: /block menu/i })
    fireEvent.dragStart(document.getElementById('block-b-list')!)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('offers `move into a new page` only where the canvas can do it, and hands it the block', async () => {
    const user = userEvent.setup()
    const onMoveIntoNewPage = jest.fn()
    renderCanvas([heading, list], onMoveIntoNewPage)
    await user.click(handleOf('b-list'))
    const block = within(await screen.findByRole('menu', { name: /block menu/i })).getByRole(
      'group',
      { name: 'block' }
    )
    expect(
      within(block)
        .getAllByRole('menuitem')
        .map((i) => i.textContent)
    ).toEqual(['move into a new page', 'copy link to block', 'delete'])
    await user.click(within(block).getByRole('menuitem', { name: 'move into a new page' }))
    expect(onMoveIntoNewPage).toHaveBeenCalledWith(list)
  })

  it('⌥↓ on the focused handle moves the block, and opens no menu', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    handleOf('b-heading').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-list', 'b-heading'])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('deletes the block from the last row of `block`', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(handleOf('b-heading'))
    await user.click(await screen.findByRole('menuitem', { name: 'delete' }))
    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-list'])
  })
})

describe('⌘/ opens the same menu on a focused block', () => {
  const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')
  afterEach(() => {
    if (platform) Object.defineProperty(window.navigator, 'platform', platform)
    else delete (window.navigator as { platform?: string }).platform
  })

  const setPlatform = (value: string) =>
    Object.defineProperty(window.navigator, 'platform', { value, configurable: true })

  /** A text block is focused by putting the caret in its text. */
  const textBlockIn = (blockId: string) =>
    within(document.getElementById(`block-${blockId}`)!).findByRole('textbox', {
      name: 'text block',
    })

  it('Ctrl+/ off Apple; Escape then hands focus back to where the person was in the block', async () => {
    setPlatform('Linux x86_64')
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const inside = await textBlockIn('b-list')
    inside.focus()
    await user.keyboard('{Control>}/{/Control}')

    const menu = await screen.findByRole('menu', { name: /block menu/i })
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
    await user.keyboard('{ArrowDown}')
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(inside).toHaveFocus())
  })

  it('opened with the chord, a letter and Enter pick an item without leaving the keyboard', async () => {
    setPlatform('Linux x86_64')
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const inside = await textBlockIn('b-list')
    inside.focus()
    await user.keyboard('{Control>}/{/Control}')
    await screen.findByRole('menu', { name: /block menu/i })
    await user.keyboard('t')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(mockCreateDatabaseFromList).toHaveBeenCalledTimes(1))
  })

  it('⌘/ on a Mac — and Ctrl+/ there does nothing', async () => {
    setPlatform('MacIntel')
    const user = userEvent.setup()
    renderCanvas([list])
    const inside = await textBlockIn('b-list')
    inside.focus()
    await user.keyboard('{Control>}/{/Control}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.keyboard('{Meta>}/{/Meta}')
    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
  })
})

describe('turn into — list, checklist, text', () => {
  it('turns a list into a checklist in place, keeping the block and its items', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([shopping])
    await user.click(handleOf('b-shop'))
    await user.click(await screen.findByRole('menuitem', { name: 'checklist' }))

    const next = lastBlocks(onChange)
    expect(next).toEqual([{ ...shopping, marker: 'check' }])
    expect(await screen.findByText(/turned into a checklist/i)).toBeInTheDocument()
  })

  it('undo puts the block back as it was', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, shopping])
    await user.click(handleOf('b-shop'))
    await user.click(await screen.findByRole('menuitem', { name: 'text' }))
    expect(lastBlocks(onChange)[1]).toMatchObject({ id: 'b-shop', type: 'text' })

    await user.click(await screen.findByRole('button', { name: /undo/i }))
    await waitFor(() => expect(lastBlocks(onChange)).toEqual([heading, shopping]))
  })
})

describe('turn into — table', () => {
  it('creates the database and swaps the list for a view of it in place, with no proposal card', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(handleOf('b-list'))
    await user.click(await screen.findByRole('menuitem', { name: /table/i }))

    await waitFor(() => expect(mockCreateDatabaseFromList).toHaveBeenCalledTimes(1))
    const [, input] = mockCreateDatabaseFromList.mock.calls[0]
    expect(input.block).toEqual(list)
    // Named after the heading above the list (6j frame 3).
    expect(input.title).toBe('ingredients')

    await waitFor(() => expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading', 'v-1']))
    expect(lastBlocks(onChange)[1]).toEqual(view)
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
    expect(await screen.findByText(/turned into a table/i)).toBeInTheDocument()
  })

  it('names the database after a labelled list’s own label', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, shopping])
    await user.click(handleOf('b-shop'))
    const tableItem = await screen.findByRole('menuitem', { name: /table/i })
    expect(tableItem).toHaveTextContent('3 rows · 2 columns')
    await user.click(tableItem)

    await waitFor(() => expect(mockCreateDatabaseFromList).toHaveBeenCalledTimes(1))
    const [, input] = mockCreateDatabaseFromList.mock.calls[0]
    expect(input.title).toBe('shopping')
    expect(input.block).toMatchObject({ id: 'b-shop', type: 'text' })
  })

  it('undo restores the list in place and removes the database it made', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(handleOf('b-list'))
    await user.click(await screen.findByRole('menuitem', { name: /table/i }))
    await user.click(await screen.findByRole('button', { name: /undo/i }))

    await waitFor(() => expect(lastBlocks(onChange)).toEqual([heading, list]))
    await waitFor(() => expect(mockDeletePage).toHaveBeenCalledWith(expect.anything(), 'db-1'))
  })
})

describe('the width row — the block menu’s `width` group', () => {
  it('keeps the picked width in place and closes the menu; undo restores the absent width', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(handleOf('b-list'))
    await user.click(await screen.findByRole('menuitem', { name: '½' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(lastBlocks(onChange)).toEqual([heading, { ...list, width: '1/2' }])

    await user.click(await screen.findByRole('button', { name: /undo/i }))
    await waitFor(() => expect(lastBlocks(onChange)).toEqual([heading, list]))
  })

  it('PATH_STEPS: picking ½ on two blocks narrows each, then shares one row', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])

    await user.click(handleOf('b-heading'))
    await user.click(await screen.findByRole('menuitem', { name: '½' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    const rootA = document.getElementById('block-b-heading')!
    const halfWidth = normalizedWidth(blockWidthStyle('1/2'))
    expect(rootA.parentElement!.style.width).toBe(halfWidth)

    await user.click(handleOf('b-list'))
    await user.click(await screen.findByRole('menuitem', { name: '½' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    const rootB = document.getElementById('block-b-list')!
    expect(rootB.parentElement!.style.width).toBe(halfWidth)

    // Both sizing divs are flat siblings of the one canvas list — sharing a
    // row is the canvas's own flex-wrap putting two half-width divs on one
    // line, not a dedicated row wrapper. `rootA`'s sizing div is keyed on
    // `block.id` alone, so it's the SAME node captured above, never swapped
    // out when the row gains its second block (gutted, KAN-43).
    expect(rootA.parentElement!.parentElement).toBe(rootB.parentElement!.parentElement)
  })
})

describe('copy link to block', () => {
  it('copies the page’s own URL with the block’s anchor', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/pages?nodeId=page-1#somewhere')
    renderCanvas([heading, list])
    await user.click(handleOf('b-list'))
    await user.click(await screen.findByRole('menuitem', { name: 'copy link to block' }))

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        `${window.location.origin}/pages?nodeId=page-1#block-b-list`
      )
    )
    expect(await screen.findByText(/copied the link to this block/i)).toBeInTheDocument()
  })

  it('arriving at that link scrolls to the block and focuses it', async () => {
    window.history.replaceState(null, '', '/pages?nodeId=page-1#block-b-list')
    renderCanvas([heading, list])
    const root = document.getElementById('block-b-list')!
    await waitFor(() => expect(root).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalled()
    expect(scrollIntoView.mock.instances.at(-1)).toBe(root)
  })

  it('follows the link when the hash changes on an open page', async () => {
    renderCanvas([heading, list])
    expect(document.getElementById('block-b-heading')).not.toHaveFocus()
    window.history.replaceState(null, '', '/#block-b-heading')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => expect(document.getElementById('block-b-heading')).toHaveFocus())
  })
})
