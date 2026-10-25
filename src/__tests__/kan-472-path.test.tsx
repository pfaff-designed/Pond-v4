/**
 * KAN-472 path test — the real `ShellCommands` mounted beside a real
 * `DocumentPanel` (so the breadcrumb reads a real ancestry), same harness as
 * `kan-335-path.test.tsx`: `CommandPathProvider` carries `DocumentPanel`'s
 * published path to `ShellCommands`'s `PondCommand`, over the same
 * network/Supabase mock boundary (`next/navigation`, `@/lib/supabase/client`,
 * `@/lib/pages/client`, `@/lib/pages/tree`, `@/lib/pages/home`,
 * `@/lib/templates/client`, `@/lib/pond/context`, `@/lib/pond/name`).
 *
 * Fixture: three real pages, house → roof → gutters (a `parent_id` chain),
 * with gutters open (`?nodeId=gutters`) — PATH_STEPS from the ticket.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { CommandPathProvider } from '@/lib/layout/command-path'
import { workspaceUrl } from '@/lib/pages/nav'
import type { PageRow } from '@/lib/pages/tree'

const POND_ID = 'pond-1'

const ROWS: PageRow[] = [
  { id: 'house', parent_id: null, type: 'page', title: 'house', order: 0, updated_at: '' },
  { id: 'roof', parent_id: 'house', type: 'page', title: 'roof', order: 0, updated_at: '' },
  { id: 'gutters', parent_id: 'roof', type: 'page', title: 'gutters', order: 0, updated_at: '' },
]

const PAGES_BY_ID: Record<string, { id: string; parentId: string | null; type: 'page'; title: string; blocks: unknown[]; order: number; props: Record<string, unknown> }> =
  {
    house: { id: 'house', parentId: null, type: 'page', title: 'house', blocks: [], order: 0, props: {} },
    roof: { id: 'roof', parentId: 'house', type: 'page', title: 'roof', blocks: [], order: 0, props: {} },
    gutters: {
      id: 'gutters',
      parentId: 'roof',
      type: 'page',
      title: 'gutters',
      blocks: [{ id: 'b0', type: 'text', content: 'leaky' }],
      order: 0,
      props: {},
    },
  }

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'nodeId' ? 'gutters' : null),
  }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: POND_ID, name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => POND_ID,
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async (_supabase: unknown, id: string) =>
    PAGES_BY_ID[id] ? { ...PAGES_BY_ID[id] } : null
  ),
  listPages: jest.fn(async () => Object.values(PAGES_BY_ID).map((p) => ({ ...p }))),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(async () => ROWS.map((r) => ({ ...r }))),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

function renderPath() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <DeletionUndoProvider>
        <CommandPathProvider>
          <DocumentPanel />
          <ShellCommands />
        </CommandPathProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

async function ready() {
  await waitFor(() => expect(screen.getByText('leaky')).toBeInTheDocument())
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(push as jest.Mock).mockClear()
})

describe('KAN-472 path test — ancestor crumbs navigate, the current crumb opens ⌘K', () => {
  it('walks PATH_STEPS: house › roof › gutters, click house navigates, click gutters opens the palette', async () => {
    const user = userEvent.setup()

    renderPath()
    await ready()

    const houseLink = await screen.findByRole('link', { name: 'house' })
    expect(houseLink).toHaveAttribute('href', workspaceUrl({ id: 'house', type: 'page', title: 'house' }))

    // Clicking an ancestor navigates and must not also open the palette.
    await user.click(houseLink)
    expect(push).toHaveBeenCalledWith(workspaceUrl({ id: 'house', type: 'page', title: 'house' }))
    expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()

    // Clicking the current crumb opens the palette instead of navigating.
    // `getByRole('button', …)`, not `getByText`: the page title is now a
    // textarea whose value is also `gutters`, and `getByText` matches that too.
    const currentCrumb = screen.getByRole('button', { name: 'gutters' })
    await user.click(currentCrumb)
    await screen.findByRole('combobox', { name: 'command palette' })
  })

  it('Tab reaches the house ancestor link before the opener, and Enter on it navigates', async () => {
    const user = userEvent.setup()

    renderPath()
    await ready()

    const houseLink = await screen.findByRole('link', { name: 'house' })
    const opener = screen.getByRole('button', { name: 'gutters' })

    // Walk the real tab order from the page until the house link gets focus,
    // asserting the opener button never gets there first.
    let guard = 0
    while (document.activeElement !== houseLink) {
      expect(document.activeElement).not.toBe(opener)
      await user.tab()
      guard += 1
      if (guard > 100) throw new Error('Tab never reached the house ancestor link')
    }
    expect(houseLink).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(push).toHaveBeenCalledWith(workspaceUrl({ id: 'house', type: 'page', title: 'house' }))
    expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()
  })
})
