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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
import { textEditorOf } from './helpers/text-block'

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

  it('never opens on the bare press — only a click (pointerup with no movement) opens it (KAN-440)', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    // Base UI's own trigger opens on pointerdown; that request must be dropped.
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.pointerUp(handle)
    fireEvent.click(handle)
    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('a press that moves before releasing never opens the menu, even if a click still lands (KAN-440)', () => {
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 40 })
    fireEvent.pointerUp(handle)
    fireEvent.click(handle)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('pointerdown straight into a dragstart, with no pointerup between, never opens the menu (KAN-440)', () => {
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.dragStart(document.getElementById('block-b-list')!)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('a press that moves only within the drag threshold still opens on release (KAN-440)', async () => {
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(handle, { clientX: 12, clientY: 10 })
    fireEvent.pointerUp(handle)
    fireEvent.click(handle)
    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
  })

  it('a press released off the handle resets the gate, so Enter on the handle still opens it (KAN-440)', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    // No `pointerup` ever fires on the handle itself — without
    // `setPointerCapture`, a real browser delivers it to whatever is under
    // the pointer at release, here `document.body`.
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    handle.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
  })

  it('a pointercancel off the handle resets the gate too (KAN-440)', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerCancel(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    handle.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
  })

  it('a press that moves just past the threshold, released and clicked on the handle itself, still opens nothing (KAN-440)', () => {
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(handle, { clientX: 15, clientY: 10 })
    fireEvent.pointerUp(handle)
    fireEvent.click(handle)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('a click on the handle while its menu is open closes it, and does not reopen it (KAN-440)', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    await user.click(handle)
    await screen.findByRole('menu', { name: /block menu/i })

    await user.click(handle)
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

  it('keeps the desktop handle outside the card, revealed only on hover/focus (KAN-259 regression)', () => {
    renderCanvas([heading, list])
    const root = document.getElementById('block-b-list')!
    const handle = root.querySelector('[data-part="handle"]')!
    expect(handle).toHaveClass('-left-3.5')
    expect(handle.className).toMatch(/opacity-0/)
    expect(handleOf('b-list')).toHaveClass('h-6', 'w-3', 'rounded-[6px]')
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

  it('⌥↓ on a row\'s rowStart holder swaps it within the row, not into a split (KAN-440)', async () => {
    const user = userEvent.setup()
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2', rowStart: true }
    const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/2', rowStart: true }
    const y: Block = { id: 'b-y', type: 'text', content: 'y', width: '1/2' }
    const { onChange } = renderCanvas([a, x, y])
    handleOf('b-x').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    const next = lastBlocks(onChange)
    expect(next).toEqual([a, { ...y, rowStart: true }, { ...x, rowStart: undefined }])
  })

  it('⌥↑ on the row-mate left behind swaps the rowStart right back (KAN-440)', async () => {
    const user = userEvent.setup()
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2', rowStart: true }
    const y: Block = { id: 'b-y', type: 'text', content: 'y', width: '1/2', rowStart: true }
    const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/2' }
    const { onChange } = renderCanvas([a, y, x])
    handleOf('b-x').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    const next = lastBlocks(onChange)
    expect(next).toEqual([a, { ...x, rowStart: true }, { ...y, rowStart: undefined }])
  })

  it('⌥↓ across a row boundary swaps the two blocks at the seam but keeps both rows (KAN-440)', async () => {
    const user = userEvent.setup()
    const p: Block = { id: 'b-p', type: 'text', content: 'p', width: '1/2' }
    const q: Block = { id: 'b-q', type: 'text', content: 'q', width: '1/2' }
    const r: Block = { id: 'b-r', type: 'text', content: 'r', width: '1/2', rowStart: true }
    const s: Block = { id: 'b-s', type: 'text', content: 's', width: '1/2' }
    const { onChange } = renderCanvas([p, q, r, s])
    handleOf('b-q').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    const next = lastBlocks(onChange)
    expect(next).toEqual([p, { ...r, rowStart: undefined }, { ...q, rowStart: true }, s])
  })

  it('deleting a row\'s rowStart holder hands rowStart to the row-mate left behind (KAN-440)', async () => {
    const user = userEvent.setup()
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2', rowStart: true }
    const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/2', rowStart: true }
    const y: Block = { id: 'b-y', type: 'text', content: 'y', width: '1/2' }
    const { onChange } = renderCanvas([a, x, y])
    await user.click(handleOf('b-x'))
    await user.click(await screen.findByRole('menuitem', { name: 'delete' }))
    expect(lastBlocks(onChange)).toEqual([a, { ...y, rowStart: true }])
  })
})

describe('phone: tapping a block reveals the handle and opens the same menu (frame 6)', () => {
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('focus landing in a text block’s editable (what a tap on it does) bubbles to the handle’s ancestor', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, table])
    const root = document.getElementById('block-b-heading')!
    const editable = await within(root).findByRole('textbox', { name: 'text block' })

    // jsdom's ProseMirror view can't resolve a pointer position (no
    // `elementFromPoint`), so a tap is simulated the way the browser resolves
    // it underneath — moving DOM focus onto the editable.
    act(() => {
      editable.focus()
    })
    expect(root.contains(document.activeElement)).toBe(true)

    await user.click(handleOf('b-heading'))
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    expect(within(menu).getByRole('group', { name: 'width' })).toBeInTheDocument()
    expect(within(menu).getByText('widths show on wider screens. on a phone every block is full.'))
      .toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: '½' })).toHaveClass('h-[44px]')
  })

  it('sits inside the card at 44x44 (right 2 · top 2 · radius 14), always visible, and the header reserves 40px (KAN-259)', () => {
    renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!
    const handle = root.querySelector('[data-part="handle"]')!
    expect(handle).toHaveClass('right-0.5', 'top-0.5', 'z-[1]')
    expect(handle.className).not.toMatch(/opacity-0/)
    expect(handleOf('b-table')).toHaveClass('h-11', 'w-11', 'rounded-[14px]')
    const headRow = within(root).getByText('table').parentElement!
    expect(headRow).toHaveClass('pr-10')
  })

  it('a tap landing on a card block’s body (not the root) still bubbles to the handle’s ancestor', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!

    await user.click(within(root).getByText('Tool'))
    expect(root.contains(document.activeElement)).toBe(true)

    await user.click(handleOf('b-table'))
    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
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

  it('⌘/ still opens the menu after a drag from the handle (KAN-440)', async () => {
    setPlatform('MacIntel')
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const handle = handleOf('b-list')

    // An HTML5 drag ends in dragend, never pointerup — the gate must still
    // reset, or `down` stays true and blocks every later open.
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })
    fireEvent.dragStart(document.getElementById('block-b-list')!)
    fireEvent.dragEnd(document.getElementById('block-b-list')!)

    const inside = await textBlockIn('b-list')
    inside.focus()
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

  it('leaves rowStart as it was: picking a width never sets or clears it (KAN-440)', async () => {
    const user = userEvent.setup()
    const marked: Block = { ...list, rowStart: true }
    const { onChange } = renderCanvas([heading, marked])
    await user.click(handleOf('b-list'))
    await user.click(await screen.findByRole('menuitem', { name: '½' }))

    expect(lastBlocks(onChange)).toEqual([heading, { ...marked, width: '1/2' }])
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

  it('hovering ½ previews the same reflow as picking it, without persisting', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])

    await user.click(handleOf('b-heading'))
    await user.click(await screen.findByRole('menuitem', { name: '½' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    const rootA = document.getElementById('block-b-heading')!
    const halfWidth = normalizedWidth(blockWidthStyle('1/2'))
    expect(rootA.parentElement!.style.width).toBe(halfWidth)

    await user.click(handleOf('b-list'))
    await user.hover(await screen.findByRole('menuitem', { name: '½' }))

    const rootB = document.getElementById('block-b-list')!
    expect(rootB.parentElement!.style.width).toBe(halfWidth)
    expect(rootA.parentElement!.parentElement).toBe(rootB.parentElement!.parentElement)

    // Only the first pick persisted — hovering the second never writes to `blocks`.
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('PATH_STEPS: Esc after hovering ⅔ leaves the block at its kept width', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])

    await user.click(handleOf('b-list'))
    await user.hover(await screen.findByRole('menuitem', { name: '⅔' }))

    const root = document.getElementById('block-b-list')!
    expect(root.parentElement!.style.width).toBe(normalizedWidth(blockWidthStyle('2/3')))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    expect(root.parentElement!.style.width).toBe('100%')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('PATH_STEPS: the full walk — handle to kept width, then the phone variant', () => {
  const originalMatchMedia = window.matchMedia

  it('handle opens the menu with the width row between turn into and block; hover previews and reflows with a note; Esc discards; a click keeps it with an undo toast; and the same menu, sized for a phone, opens from a tap', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])

    // Step 2: the handle opens the menu, width row between `turn into` and `block`.
    await user.click(handleOf('b-heading'))
    let menu = await screen.findByRole('menu', { name: /block menu/i })
    const order = menu.textContent ?? ''
    expect(order.indexOf('turn into')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('turn into')).toBeLessThan(order.indexOf('¼'))
    expect(order.indexOf('¾')).toBeLessThan(order.indexOf('copy link to block'))
    expect(within(menu).getByRole('menuitem', { name: 'full' }).className).toContain('bg-mn-text')

    // Set the heading to ½ first, purely so the list's own preview below has a
    // row to share — a lone fraction next to nothing else fractional never reflows.
    await user.click(within(menu).getByRole('menuitem', { name: '½' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    const rootHeading = document.getElementById('block-b-heading')!
    const halfWidth = normalizedWidth(blockWidthStyle('1/2'))
    expect(rootHeading.parentElement!.style.width).toBe(halfWidth)

    await user.click(handleOf('b-list'))
    menu = await screen.findByRole('menu', { name: /block menu/i })
    const rootList = document.getElementById('block-b-list')!
    expect(rootList.parentElement!.style.width).toBe('100%')

    // Step 3: hovering ½ resizes it in place, reflows it beside the heading, and notes it.
    await user.hover(within(menu).getByRole('menuitem', { name: '½' }))
    expect(rootList.parentElement!.style.width).toBe(halfWidth)
    expect(rootHeading.parentElement!.parentElement).toBe(rootList.parentElement!.parentElement)
    expect(
      within(menu).getByText('showing ½ on the page · click to keep, esc to go back')
    ).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)

    // Step 4: Esc puts it back — nothing new was saved.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(rootList.parentElement!.style.width).toBe('100%')
    expect(onChange).toHaveBeenCalledTimes(1)

    // Step 5: reopen, click ½ — kept, with the undo toast.
    await user.click(handleOf('b-list'))
    menu = await screen.findByRole('menu', { name: /block menu/i })
    await user.click(within(menu).getByRole('menuitem', { name: '½' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(rootList.parentElement!.style.width).toBe(halfWidth)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect((await screen.findAllByText(/set the block width/i)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /undo/i }).length).toBeGreaterThan(0)

    // Step 6: the phone variant — tap a block, its handle shows, the same
    // menu opens 350px wide with 44px cells and the phone note.
    cleanup()
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const phoneUser = userEvent.setup()
      renderCanvas([heading, list])
      const phoneRoot = document.getElementById('block-b-heading')!
      const editable = await within(phoneRoot).findByRole('textbox', { name: 'text block' })
      act(() => {
        editable.focus()
      })
      expect(phoneRoot.contains(document.activeElement)).toBe(true)

      await phoneUser.click(handleOf('b-heading'))
      const phoneMenu = await screen.findByRole('menu', { name: /block menu/i })
      expect(phoneMenu.className).toContain('w-[350px]')
      expect(within(phoneMenu).getByRole('menuitem', { name: '½' }).className).toContain('h-[44px]')
      expect(
        within(phoneMenu).getByText('widths show on wider screens. on a phone every block is full.')
      ).toBeInTheDocument()
    } finally {
      window.matchMedia = originalMatchMedia
    }
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

describe('⌘⌫ deletes the focused block (`Pond 08 Edges` 8e)', () => {
  const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')
  afterEach(() => {
    if (platform) Object.defineProperty(window.navigator, 'platform', platform)
    else delete (window.navigator as { platform?: string }).platform
  })

  const setPlatform = (value: string) =>
    Object.defineProperty(window.navigator, 'platform', { value, configurable: true })

  const textFieldOf = (blockId: string) =>
    within(document.getElementById(`block-${blockId}`)!).findByRole('textbox', {
      name: 'text block',
    })

  it('on a focused non-text block, deletes it with the undo toast', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true })

    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading'])
    expect(await screen.findByText('Deleted table block')).toBeInTheDocument()
  })

  it('Ctrl+⌫ off a Mac does the same', async () => {
    setPlatform('Linux x86_64')
    const { onChange } = renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Backspace', ctrlKey: true })

    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading'])
  })

  it('with the caret at the start of a text block, deletes it too', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, list])
    const field = await textFieldOf('b-list')
    act(() => textEditorOf(field).commands.focus('start'))
    fireEvent.keyDown(field, { key: 'Backspace', metaKey: true })

    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading'])
  })

  it('fired on the ProseMirror node itself — ahead of tiptap’s own Mod-Backspace keymap, which listens on that same node — still deletes the block and shows the undo toast', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, list])
    const field = await textFieldOf('b-list')
    act(() => textEditorOf(field).commands.focus('start'))
    fireEvent.keyDown(field, { key: 'Backspace', metaKey: true })

    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading'])
    expect(await screen.findByText('Deleted text block')).toBeInTheDocument()
  })

  it('with text before the caret in a text block, leaves the block for the editor’s own delete-to-line-start', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, list])
    const field = await textFieldOf('b-list')
    act(() => textEditorOf(field).commands.focus('end'))
    fireEvent.keyDown(field, { key: 'Backspace', metaKey: true })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('select-all then ⌘⌫ in a non-empty text block leaves the block count unchanged', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, list])
    const field = await textFieldOf('b-list')
    act(() => textEditorOf(field).commands.selectAll())
    fireEvent.keyDown(field, { key: 'Backspace', metaKey: true })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('fired from a table cell input leaves the block count unchanged', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, table])
    const cell = within(document.getElementById('block-b-table')!).getByRole('textbox', {
      name: 'Tool, row 1',
    })
    fireEvent.keyDown(cell, { key: 'Backspace', metaKey: true })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('Delete on the selected row removes the block', async () => {
    const { onChange } = renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Delete' })

    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading'])
    expect(await screen.findByText('Deleted table block')).toBeInTheDocument()
  })

  it('Backspace on the selected row removes the block — that key is Delete on a Mac', async () => {
    const { onChange } = renderCanvas([heading, table])
    const root = document.getElementById('block-b-table')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Backspace' })

    expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-heading'])
  })

  it('Delete inside a table cell leaves the block', async () => {
    const { onChange } = renderCanvas([heading, table])
    const cell = within(document.getElementById('block-b-table')!).getByRole('textbox', {
      name: 'Tool, row 1',
    })
    fireEvent.keyDown(cell, { key: 'Delete' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('fired from a todo item input leaves the block count unchanged', async () => {
    setPlatform('MacIntel')
    const { onChange } = renderCanvas([heading, shopping])
    const item = within(document.getElementById('block-b-shop')!).getAllByRole('textbox', {
      name: 'Item',
    })[0]
    fireEvent.keyDown(item, { key: 'Backspace', metaKey: true })

    expect(onChange).not.toHaveBeenCalled()
  })
})
