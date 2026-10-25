/**
 * KAN-469 — ⌘⇧P's ENTRY into `move page to…`'s pick mode: the open page's own
 * chord opens the palette already filtered to candidate targets, with the
 * moving page and its descendants left out and the pond's root offered. And
 * the pick mode's SELECT: picking a candidate row commits the move through
 * the same `moveAndStageUndo` the rail's own drag-move calls, same toast.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { movePage } from '@/lib/pages/client'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'

// A `mock`-prefixed name so jest's out-of-scope check allows a per-test override
// (the extra-root regression test below opens "work" rather than "Roof").
let mockCurrentNodeId = 'roof'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockCurrentNodeId : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))

jest.mock('@/lib/pages/client', () => ({
  movePage: jest.fn(),
  createPage: jest.fn(),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  duplicatePage: jest.fn(),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([
    { id: 'house', parent_id: null, type: 'page', title: 'House', order: 0, updated_at: '' },
    { id: 'roof', parent_id: null, type: 'page', title: 'Roof', order: 1, updated_at: '' },
    {
      id: 'roof-shingle',
      parent_id: 'roof',
      type: 'page',
      title: 'Shingle',
      order: 0,
      updated_at: '',
    },
    {
      id: 'work',
      parent_id: null,
      type: 'page',
      title: 'Work',
      order: 2,
      updated_at: '',
      props: { root: true },
    },
    { id: 'blank', parent_id: null, type: 'page', title: '', order: 3, updated_at: '' },
  ]),
}))

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
}

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )

beforeEach(() => {
  mockCurrentNodeId = 'roof'
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  jest.mocked(movePage).mockResolvedValue({
    id: 'rec-1',
    before: { parentId: null, parentTitle: 'Life', siblingOrder: ['roof'] },
    after: { parentId: 'house', parentTitle: 'House', siblingOrder: ['roof'] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
})

afterEach(() => jest.restoreAllMocks())

it('⌘⇧P with "Roof" open shows the picker — House and the root list, Roof and its descendants don\'t', async () => {
  renderShell()

  // ⌘K first, so `pages` has settled by the time ⌘⇧P reads it — its own
  // open/close doesn't touch `movePick`, only `handleOpenChange`'s does.
  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.keyDown(document, { key: 'k', metaKey: true })

  fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })

  const input = await screen.findByRole('combobox', { name: 'command palette' })
  expect(input).toHaveAttribute('placeholder', 'move Roof to…')

  expect(await screen.findByRole('option', { name: /House/ })).toBeInTheDocument()
  expect(await screen.findByRole('option', { name: /Life/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /^Roof$/ })).toBeNull()
  expect(screen.queryByRole('option', { name: /Shingle/ })).toBeNull()
})

// KAN-490/491: the rail refuses to drag an extra root (`props.root` with no
// parent) — ⌘K's move row/chord must agree, or a ⌘K move reparents it with
// `props.root` still set.
it('⌘⇧P on an extra root opens no picker — the row\'s own chord is refused', async () => {
  mockCurrentNodeId = 'work'
  renderShell()

  fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })

  expect(screen.queryByRole('combobox', { name: 'command palette' })).not.toBeInTheDocument()
})

it('⌘⇧P on an untitled page reads "move Untitled to…", not "move  to…"', async () => {
  mockCurrentNodeId = 'blank'
  renderShell()

  // ⌘K first, so `pages` has settled by the time ⌘⇧P reads it (see the
  // entry test above for why).
  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.keyDown(document, { key: 'k', metaKey: true })

  fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })

  const input = await screen.findByRole('combobox', { name: 'command palette' })
  expect(input).toHaveAttribute('placeholder', 'move Untitled to…')
})

it('a non-matching query in pick mode shows a plain dead end, no make-page row, and ↵ does not move', async () => {
  const user = userEvent.setup()
  renderShell()

  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.keyDown(document, { key: 'k', metaKey: true })

  fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  await user.type(input, 'hosue')

  await screen.findByText('no page matches “hosue”')
  expect(screen.queryByRole('option', { name: /new page/ })).toBeNull()
  expect(screen.queryByRole('option')).toBeNull()

  await user.keyboard('{Enter}')
  expect(movePage).not.toHaveBeenCalled()
})

it('picking "House" moves Roof into it and shows the undo toast', async () => {
  const user = userEvent.setup()
  renderShell()

  // ⌘K first, so `pages` has settled by the time ⌘⇧P reads it (see the
  // entry test above for why).
  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.keyDown(document, { key: 'k', metaKey: true })

  fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })
  const option = await screen.findByRole('option', { name: /House/ })
  await user.click(option)

  expect(movePage).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ id: 'roof', newParentId: 'house', siblingOrder: ['roof'] })
  )
  await screen.findByText('moved Roof to House ·')
  // The combobox unmounts once the close morph settles (150ms, real time) —
  // `waitFor` rather than an immediate assert, or this reads as flaky.
  await waitFor(() =>
    expect(screen.queryByRole('combobox', { name: 'command palette' })).not.toBeInTheDocument()
  )
})
