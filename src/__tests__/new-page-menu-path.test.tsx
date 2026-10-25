/**
 * KAN-198 path test A: the real `<Rail />` surface, not the menu in
 * isolation — a row's ＋ opens the new-page menu, arrow keys walk its two
 * rows, and Esc closes it without making anything.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createPage } from '@/lib/pages/client'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestComposerNotice } from '@/lib/terminal-focus'
import { pagesKey } from '@/lib/pages/keys'
import { mountRail, ROWS } from './helpers/rail-sweep-fixture'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-page', title: '' }),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))

// Only `ShellCommands`'s own query needs a resolved `fetchPages` — `mountRail`
// above seeds its cache directly and never calls it.
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([]),
}))

afterEach(() => jest.clearAllMocks())

const menu = () => screen.getByRole('menu', { name: 'new page menu' })
const items = () => within(menu()).getAllByRole('menuitem')

it('a row\'s + opens the new-page menu with its header and both rows, walkable by arrow keys', async () => {
  const user = userEvent.setup()
  mountRail()

  await user.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByRole('menu', { name: 'new page menu' })

  expect(screen.getByText('new page in Health')).toBeInTheDocument()
  expect(items().map((item) => item.textContent)).toEqual([
    'pageblocks, text, databases',
    'from a templatetwelve to start from',
  ])

  // Opened by click, nothing is highlighted yet; the first ↓ lands on "page".
  await user.keyboard('{ArrowDown}')
  expect(within(menu()).getByRole('menuitem', { name: /^page/ })).toHaveAttribute(
    'data-highlighted'
  )

  await user.keyboard('{ArrowDown}')
  expect(within(menu()).getByRole('menuitem', { name: /^from a template/ })).toHaveAttribute(
    'data-highlighted'
  )

  await user.keyboard('{ArrowUp}')
  expect(within(menu()).getByRole('menuitem', { name: /^page/ })).toHaveAttribute(
    'data-highlighted'
  )

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(createPage).not.toHaveBeenCalled()
  expect(screen.getByRole('treeitem', { name: 'Health' })).toHaveFocus()
})

it('the ＋ opens the menu on its first click even right after selecting the row and after a rerender (the live intermittent-miss bug)', async () => {
  const user = userEvent.setup()
  const client = mountRail()

  // Right after selecting the row — one of the three live-reported misses.
  await user.click(screen.getByRole('treeitem', { name: 'Health' }))
  const addBeforeRerender = screen.getByRole('button', { name: 'Add sub-page to Health' })
  expect(addBeforeRerender).toHaveAttribute('aria-haspopup', 'menu')

  // A title rename rewrites the row's title — the row (and its ＋) rerenders
  // with a fresh element, the other live-reported miss.
  client.setQueryData(
    pagesKey('pond-1'),
    ROWS.map((row) => (row.id === 'health' ? { ...row, title: 'Health & Fitness' } : row))
  )

  const add = await screen.findByRole('button', { name: 'Add sub-page to Health & Fitness' })
  expect(add).toHaveAttribute('aria-haspopup', 'menu')
  await user.click(add)
  await screen.findByRole('menu', { name: 'new page menu' })
})

it('a double ↵ on "page" makes exactly one page under that row (G9)', async () => {
  const user = userEvent.setup()
  mountRail()

  await user.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByRole('menu', { name: 'new page menu' })

  await user.keyboard('{ArrowDown}{Enter}{Enter}')

  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(createPage).toHaveBeenCalledTimes(1)
  expect(createPage).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    expect.objectContaining({ parentId: 'health' })
  )
})

it('"from a template" makes a page and navigates to it carrying the templates signal', async () => {
  const user = userEvent.setup()
  mountRail()

  await user.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByRole('menu', { name: 'new page menu' })

  await user.click(within(menu()).getByRole('menuitem', { name: /^from a template/ }))

  await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1))
  expect(createPage).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    expect.objectContaining({ parentId: 'health' })
  )
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  const url = mockPush.mock.calls[0][0] as string
  expect(url).toContain('templates=1')
  expect(url).toContain('nodeId=new-page')
})

it('Path test C: ⌘K → new page "groceries" creates it directly through ShellCommands, no dialog', async () => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  const user = userEvent.setup()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: 'groceries' } })

  await user.click(await screen.findByRole('option', { name: /new page/ }))

  await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1))
  expect(createPage).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    expect.objectContaining({ title: 'groceries' })
  )
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('a bare ⌘K "new page" (no query) writes the rail\'s blank title, not "untitled"', async () => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  const user = userEvent.setup()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: '>' } })

  // The minted "new page "q" under …" row also matches /new page/ — only the
  // standing row's label has no `under`.
  const options = await screen.findAllByRole('option')
  const bare = options.find((o) => /new page/.test(o.textContent ?? '') && !/under/.test(o.textContent ?? ''))
  if (!bare) throw new Error('bare "new page" row not found')
  await user.click(bare)

  await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1))
  expect(createPage).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    expect.objectContaining({ title: '' })
  )
})

it('a rejecting createPage shows the notice instead of leaving the palette silent', async () => {
  ;(createPage as jest.Mock).mockRejectedValueOnce(new Error('boom'))
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  const user = userEvent.setup()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: 'groceries' } })

  await user.click(await screen.findByRole('option', { name: /new page/ }))

  await waitFor(() =>
    expect(requestComposerNotice).toHaveBeenCalledWith("can't make the page — try again.")
  )
})
