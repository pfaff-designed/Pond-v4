/**
 * Life is a page (#234; `Pond 03 Concepts`: "The only container. A page holds
 * blocks, and pages nest inside pages… Life is the page at the top.").
 *
 * The root (no ?nodeId) renders through the SAME DocumentPanel path as every
 * other page: the reserved home row's title and blocks, the always-visible
 * "+ Add a block", and its nested pages — the top-level pages — through the one
 * shared children grid. No bespoke surface, no focal numeral, no closing line.
 * An area is the same page with pages inside it (#108).
 *
 * AUDIT W9: the breadcrumb starts at the root PAGE — its own title — rather than
 * assuming the pond is called "life".
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

// Which page the URL names — null is the root, Life.
let currentNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// The children grid reads ['pages'] — top-level areas + content. NO home row
// (it's stripped by fetchPages upstream), so Life is never its own child.
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

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

const PAGES: Record<string, Record<string, unknown>> = {
  health: { id: 'health', parentId: null, type: 'page', title: 'Health', blocks: [], props: {} },
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
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
  it('renders the root as an ordinary page: its title, the add affordance, and its top-level pages', async () => {
    renderPanel()
    // The ordinary page header — the home row's own title, editable like any page.
    expect(await screen.findByLabelText('Page title')).toHaveValue('life')
    // Its nested pages: the top-level pages, through the shared children grid.
    expect(await screen.findByText('Health')).toBeInTheDocument()
    // Empty Life shows the always-visible foot add, like every page.
    expect(await screen.findByRole('button', { name: 'Add a block' })).toBeInTheDocument()
    // No bespoke surface survives: no closing line, no section label.
    expect(screen.queryByText(/That’s the whole of it/)).not.toBeInTheDocument()
    expect(screen.queryByText('Everything within')).not.toBeInTheDocument()
  })

  it('loads the root page through the ordinary page read, by the home row id', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    expect(mockGetPage).toHaveBeenCalledWith(expect.anything(), 'home-1')
  })

  it('renders Life’s own blocks above its nested pages', async () => {
    HOME_BLOCKS = [{ id: 'b1', type: 'text', content: 'Welcome to my life' }]
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Edit text block' })).toBeInTheDocument()
    expect(await screen.findByText('Health')).toBeInTheDocument()
  })

  it('the breadcrumb starts at the root page — its own title, not an assumed name (W9)', async () => {
    HOME_TITLE = 'home'
    renderPanel()
    expect(await screen.findByLabelText('Page title')).toHaveValue('home')
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('home')).toBeInTheDocument()
    expect(within(nav).queryByText('life')).toBeNull()
  })

  it('leaves the databases root out of Life’s nested pages (3c: a peer root)', async () => {
    mockFetchPages.mockResolvedValue([
      ...AREA_ROWS,
      {
        id: 'root-db',
        parent_id: null,
        type: 'page',
        title: 'databases',
        order: 9,
        updated_at: '2026-08-30T09:00:00Z',
      },
      {
        id: 'db-1',
        parent_id: 'root-db',
        type: 'page',
        title: 'ingredients',
        order: 0,
        updated_at: '2026-08-30T09:00:00Z',
      },
    ])
    renderPanel()
    expect(await screen.findByText('Health')).toBeInTheDocument()
    expect(screen.queryByText('databases')).not.toBeInTheDocument()
    expect(screen.queryByText('ingredients')).not.toBeInTheDocument()
  })

  it('the add drops an empty text block ready to type — no palette (UI-audit Slice 2a)', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    expect(await screen.findByPlaceholderText('Write something…')).toBeInTheDocument()
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
      fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
      const editor = await screen.findByPlaceholderText('Write something…')
      fireEvent.change(editor, { target: { value: '/' } })
      const menu = await screen.findByRole('listbox', { name: 'blocks' })
      fireEvent.change(editor, { target: { value: `/${c.name}` } })
      fireEvent.click(within(menu).getByText(c.name))
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
          expect(call![5]).toMatchObject({ ownEdit: true })
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
      fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
      const editor = await screen.findByPlaceholderText('Write something…')
      fireEvent.change(editor, { target: { value: '/' } })
      const menu = await screen.findByRole('listbox', { name: 'blocks' })
      fireEvent.change(editor, { target: { value: `/${name}` } })
      fireEvent.click(within(menu).getByText(name))

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
  it('renders an area with no blocks of its own as an ordinary page with its pages below', async () => {
    currentNodeId = 'health'
    renderPanel()
    expect(await screen.findByLabelText('Page title')).toHaveValue('Health')
    expect(await screen.findByText('Sleep')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add a block' })).toBeInTheDocument()
    // Nothing treats it as a distinct kind of thing.
    expect(screen.queryByText(/at a glance/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add content' })).not.toBeInTheDocument()
    // The pill starts at the root page and shows only the ancestors — none here.
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('life')).toBeInTheDocument()
    expect(within(nav).queryByText('Health')).toBeNull()
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
    await screen.findByRole('button', { name: 'Add a block' })
    fireEvent.click(screen.getByRole('button', { name: 'Add a block' }))
    const editor = await screen.findByPlaceholderText('Write something…')
    fireEvent.change(editor, { target: { value: '/' } })
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.change(editor, { target: { value: '/chart' } })
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
