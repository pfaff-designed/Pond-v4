/**
 * Life is a page (#234; `Pond 03 Concepts`: "The only container. A page holds
 * blocks, and pages nest inside pages… Life is the page at the top.").
 *
 * The root (no ?nodeId) renders through the SAME DocumentPanel path as every
 * other page: the reserved home row's title and blocks, and the trailing gap
 * below them (KAN-345). No bespoke surface, no focal numeral, no closing
 * line. An area is the same page with pages inside it (#108). Nested pages themselves
 * render as page-link blocks (KAN-415) — no longer anything DocumentPanel
 * draws from `rows`, so this file keeps `rows` only for what still reads it:
 * the breadcrumb path.
 *
 * AUDIT W9: the path (`PondCommand` at rest) starts at the root PAGE — its own
 * title — rather than assuming the pond is called "life".
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { homeQueryKey } from '@/lib/pages/keys'
import type { HomePage } from '@/lib/pages/home'
import { PondContext } from '@/lib/pond/context'
import type { Block } from '@/lib/documents/types'
import { withPathProbe } from './helpers/command-path-probe'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { rowByLabel } from './helpers/slash-menu'

// Which page the URL names — null is the root, Life.
let currentNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// DocumentPanel's breadcrumb path reads ['pages'] — top-level areas + content.
// NO home row (it's stripped by fetchPages upstream), so Life is never its own
// child.
const AREA_ROWS = [
  {
    id: 'health',
    parent_id: null,
    type: 'page',
    title: 'Health',
    order: 0,
    updated_at: '2026-08-30T09:00:00Z',
  },
  {
    id: 'sleep',
    parent_id: 'health',
    type: 'page',
    title: 'Sleep',
    order: 0,
    updated_at: '2026-08-30T09:00:00Z',
  },
]
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

// The Life home row — created on first access; its blocks are Life's own content.
let HOME_BLOCKS: Block[] = []
let HOME_TITLE = 'life'
const mockGetOrCreateHomePage = jest.fn()
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: (...args: unknown[]) => mockGetOrCreateHomePage(...args),
}))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

// The real `commitBlocks` resolves `{ remembered }` for an own-edit save (KAN-355).
const mockCommitBlocks = jest.fn().mockResolvedValue({ remembered: Promise.resolve() })
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const PAGES: Record<string, Record<string, unknown>> = {
  health: { id: 'health', parentId: null, type: 'page', title: 'Health', blocks: [], props: {} },
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>{withPathProbe(<DocumentPanel />)}</DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  currentNodeId = null
  HOME_BLOCKS = []
  HOME_TITLE = 'life'
  mockFetchPages.mockResolvedValue(AREA_ROWS)
  mockGetOrCreateHomePage.mockImplementation(() =>
    Promise.resolve({ id: 'home-1', title: HOME_TITLE, blocks: HOME_BLOCKS })
  )
  mockGetPage.mockImplementation((_sb: unknown, id: string) =>
    Promise.resolve(
      id === 'home-1'
        ? {
            id: 'home-1',
            parentId: null,
            type: 'home',
            title: HOME_TITLE,
            blocks: HOME_BLOCKS,
            props: {},
          }
        : (PAGES[id] ?? null)
    )
  )
})

describe('Life is a page (#234)', () => {
  it('renders the root as an ordinary page: its title and the add affordance', async () => {
    renderPanel()
    // The ordinary page header — the home row's own title, editable like any page.
    expect(await screen.findByLabelText('Page title')).toHaveValue('life')
    // Empty Life shows the trailing gap, like every page — no button survives.
    expect(await screen.findByTestId('trailing-block-gap')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a block' })).not.toBeInTheDocument()
    // No bespoke surface survives: no closing line, no section label.
    expect(screen.queryByText(/That’s the whole of it/)).not.toBeInTheDocument()
    expect(screen.queryByText('Everything within')).not.toBeInTheDocument()
  })

  it('loads the root page through the ordinary page read, by the home row id', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    expect(mockGetPage).toHaveBeenCalledWith(expect.anything(), 'home-1')
  })

  it('renders Life’s own blocks', async () => {
    HOME_BLOCKS = [{ id: 'b1', type: 'text', content: 'Welcome to my life' }]
    renderPanel()
    expect(await findTextBlock()).toHaveTextContent('Welcome to my life')
  })

  it('the path starts at the root page — its own title, not an assumed name (W9)', async () => {
    HOME_TITLE = 'home'
    renderPanel()
    expect(await screen.findByLabelText('Page title')).toHaveValue('home')
    await waitFor(() => expect(screen.getByTestId('command-path')).toHaveTextContent(/^home$/))
  })

  it('the add drops an empty text block ready to type — no palette (UI-audit Slice 2a)', async () => {
    renderPanel()
    fireEvent.click(await screen.findByTestId('trailing-block-gap'))
    const field = await findTextBlock()
    expect(field).toHaveTextContent('')
    await waitFor(() => expect(field).toHaveFocus())
    expect(screen.queryByRole('listbox', { name: 'blocks' })).not.toBeInTheDocument()
  })

  it('add → “/” summons the palette and persists the pick to the home row', async () => {
    // #278: rows speak Pond's words — `checklist` is the todo type.
    // `table`, `gallery` and `chart` are NOT here: since #280 they open the source
    // picker instead of minting a block, which the next test pins.
    const cases: Array<{ name: string; type: string }> = [
      { name: 'checklist', type: 'todo' },
      { name: 'highlight', type: 'highlight' },
    ]
    for (const c of cases) {
      HOME_BLOCKS = []
      mockCommitBlocks.mockClear()
      const { unmount } = renderPanel()
      fireEvent.click(await screen.findByTestId('trailing-block-gap'))
      const editor = await findTextBlock()
      writeInTextBlock(editor, '/')
      // An empty page leads with its templates; typing a block's name returns to the blocks.
      await screen.findByRole('listbox', { name: 'blocks' })
      writeInTextBlock(editor, `/${c.name}`)
      const menu = await screen.findByRole('listbox', { name: 'blocks' })
      fireEvent.click(rowByLabel(menu, c.name))
      // The pick persists to the HOME row (id 'home-1'), not any area. Matched on
      // the picked block, not "the first save": the panel's debounced save is not
      // cancelled by unmount (a typed edit must still land), so an earlier test's
      // text-block save can fire during this one.
      await waitFor(
        () => {
          const call = mockCommitBlocks.mock.calls.find(
            ([, , pageId, blocks]) =>
              pageId === 'home-1' && (blocks as Block[]).some((b) => b.type === c.type)
          )
          expect(call).toBeTruthy()
          // G2 (#98 review): the person's own typed edit carries `ownEdit`, so a
          // pending diff aimed at Life goes outdated.
          expect(call![4]).toMatchObject({ ownEdit: true })
        },
        { timeout: 2000 }
      )
      unmount()
    }
  })

  // `Pond 02` 2e: "the source picker, shared by table, gallery and chart —
  // /table · /gallery · /chart". Those three rows no longer mint a block: a table
  // is a view of a database, so the person chooses the source first (#280).
  it.each(['table', 'gallery', 'chart'])(
    '“/%s” summons the source picker rather than inserting a block',
    async (name) => {
      HOME_BLOCKS = []
      mockCommitBlocks.mockClear()
      renderPanel()
      fireEvent.click(await screen.findByTestId('trailing-block-gap'))
      const editor = await findTextBlock()
      writeInTextBlock(editor, '/')
      // An empty page leads with its templates; typing a block's name returns to the blocks.
      await screen.findByRole('listbox', { name: 'blocks' })
      writeInTextBlock(editor, `/${name}`)
      const menu = await screen.findByRole('listbox', { name: 'blocks' })
      fireEvent.click(rowByLabel(menu, name))

      await waitFor(() => {
        const glass = document.querySelector('[data-part="glass"][data-kind="source"]')
        expect(glass).toBeTruthy()
        expect(glass).toHaveAttribute('data-step', 'source')
      })
      // Nothing is written until a source is picked — the pick is the person's
      // gesture, and it has not been made yet.
      expect(
        mockCommitBlocks.mock.calls.some(([, , , blocks]) =>
          (blocks as Block[]).some((b) => b.type === 'view')
        )
      ).toBe(false)
    }
  )
})

describe('an area is the same page (#108, #234)', () => {
  it('renders an area with no blocks of its own as an ordinary page', async () => {
    currentNodeId = 'health'
    renderPanel()
    expect(await screen.findByLabelText('Page title')).toHaveValue('Health')
    expect(await screen.findByTestId('trailing-block-gap')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a block' })).not.toBeInTheDocument()
    // Nothing treats it as a distinct kind of thing.
    expect(screen.queryByText(/at a glance/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add content' })).not.toBeInTheDocument()
    // The path starts at the root page and ends at this one (`PondCommand`'s `current`).
    await waitFor(() =>
      expect(screen.getByTestId('command-path')).toHaveTextContent(/^life › Health$/)
    )
  })
  // AUDIT C9 wires a chart to a nearby database; it does not invent one. The
  // nearby view here points at a collection that is NOT a child of the databases
  // root — which is what `promote-table.ts` writes — so there is no source to
  // open the chart step on, and the picker must stay on `source`. Deriving the
  // step and the source from separate expressions opened `type` with no source,
  // where ↵ wrote a brand-new empty database instead of charting the table.
  it('“/chart” beside a view the picker cannot offer stays on the source step', async () => {
    HOME_BLOCKS = [{ id: 'v1', type: 'view', mode: 'table', collectionId: 'not-a-database' }]
    renderPanel()
    fireEvent.click(await screen.findByTestId('trailing-block-gap'))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/chart')
    fireEvent.click(within(menu).getByText('chart'))

    await waitFor(() => {
      const glass = document.querySelector('[data-part="glass"][data-kind="source"]')
      expect(glass).toBeTruthy()
      expect(glass).toHaveAttribute('data-step', 'source')
    })
    expect(mockCommitBlocks).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ type: 'view', mode: 'chart' })]),
      expect.anything(),
      expect.anything()
    )
  })
})

describe('renaming the root page (#312: one root per pond)', () => {
  const POND = { id: 'pond-1', name: 'garden', glyph: null, theme: 'default', order: 0 }

  it('the new title lands in this pond’s home cache, the one the breadcrumb reads', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <PondContext.Provider
          value={{
            pond: POND,
            ponds: [POND],
            loading: false,
            reload: () => {},
            addPond: () => {},
            patchPond: () => {},
            removePond: () => {},
          }}
        >
          <DeletionUndoProvider>
            <DocumentPanel />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )
    const title = await screen.findByLabelText('Page title')
    const home = () => client.getQueryData<HomePage | null>(homeQueryKey('pond-1'))
    expect(home()?.title).toBe('life')

    fireEvent.change(title, { target: { value: 'garden' } })

    await waitFor(() =>
      expect(mockUpdateTitle).toHaveBeenCalledWith(expect.anything(), 'home-1', 'garden')
    )
    await waitFor(() => expect(home()?.title).toBe('garden'))
  })
})
