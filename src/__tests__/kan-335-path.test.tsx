/**
 * KAN-335 path test — the real `ShellCommands` mounted beside a real
 * `DocumentPanel` (so a page title exists for `ReportProblemBox`'s chip, via
 * `CommandPathProvider`: `DocumentPanel` publishes the open page's path,
 * `ShellCommands` reads it off `useCommandPath()`). Modelled on
 * `kan-302-path.test.tsx`'s harness — the same network/Supabase boundary mocks
 * (`@/lib/pages/client`, `@/lib/pages/tree`, `@/lib/pages/home`,
 * `@/lib/templates/client`, `@/lib/pond/context`, `@/lib/supabase/client`,
 * `next/navigation`) — minus `AITerminal` and its chat/change-log mocks, which
 * this path never touches. Only `global.fetch` is new here, standing in for
 * `/api/feedback`.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { CommandPathProvider } from '@/lib/layout/command-path'
import type { Block } from '@/lib/documents/types'

const PAGE_ID = 'page-1'
const POND_ID = 'pond-1'

interface FakePage {
  id: string
  parentId: string | null
  type: 'page'
  title: string
  blocks: Block[]
  props: Record<string, unknown>
  order: number
}

let fakePage: FakePage

function resetFakePage() {
  fakePage = {
    id: PAGE_ID,
    parentId: null,
    type: 'page',
    title: 'the broken page',
    blocks: [{ id: 'b0', type: 'text', content: 'Hello world' }],
    props: {},
    order: 0,
  }
}
resetFakePage()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'nodeId' ? PAGE_ID : null),
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
  getPage: jest.fn(async (_supabase: unknown, id: string) => (id === fakePage.id ? { ...fakePage } : null)),
  listPages: jest.fn(async () => [{ ...fakePage }]),
  updateTitle: jest.fn(async (_supabase: unknown, id: string, title: string) => {
    if (id === fakePage.id) fakePage.title = title
  }),
  setProperty: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
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
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Page title' })).toBeInTheDocument())
}

beforeEach(() => {
  jest.clearAllMocks()
  resetFakePage()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('KAN-335 path test — report a problem from ⌘K', () => {
  it('walks every PATH_STEPS frame: ⌘K → rep → ↵ → fill in → ↵ → filed → esc', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'KAN-901', url: 'https://pfaff-team.atlassian.net/browse/KAN-901' }),
    }) as jest.Mock
    const user = userEvent.setup()

    // 1. Any page in the app is open.
    renderPath()
    await ready()
    expect(screen.getByText('Hello world')).toBeInTheDocument()

    // 2. ⌘K opens the palette.
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })

    // 3. Typing `rep` lists `report a problem`.
    fireEvent.change(input, { target: { value: 'rep' } })
    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options.some((o) => o.textContent?.includes('report a problem'))).toBe(true)
    })

    // 4. ↵ closes the palette and opens the box with the line, placeholder and
    // the current page's title chip.
    fireEvent.keyDown(input, { key: 'Enter' })
    const box = await screen.findByRole('dialog', { name: 'report a problem' })
    expect(box).toHaveTextContent('the broken page')
    const line = screen.getByRole('textbox', { name: 'what went wrong?' })
    expect(line).toHaveAttribute('placeholder', 'what went wrong?')

    // 5. Typing the problem and pressing ↵ files one report.
    await user.type(line, 'the page will not load')
    await user.keyboard('{Enter}')

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          text: 'the page will not load',
          pageId: PAGE_ID,
          pageTitle: 'the broken page',
          url: window.location.href,
        }),
      })
    )

    // 6. The box reads `filed as KAN-NNN · thanks`, the key linking to the issue.
    await waitFor(() => expect(box).toHaveTextContent('filed as KAN-901 · thanks'))
    const link = screen.getByRole('link', { name: 'KAN-901' })
    expect(link).toHaveAttribute('href', 'https://pfaff-team.atlassian.net/browse/KAN-901')

    // 7. Esc closes the box.
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'report a problem' })).toBeNull()
  })

  it('failure frame: a missing-env 503 renders `can\'t file reports right now`', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock
    const user = userEvent.setup()

    renderPath()
    await ready()

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: 'rep' } })
    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options.some((o) => o.textContent?.includes('report a problem'))).toBe(true)
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByRole('dialog', { name: 'report a problem' })

    const line = screen.getByRole('textbox', { name: 'what went wrong?' })
    await user.type(line, 'still broken')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("can't file reports right now")
    )
  })
})
