/**
 * DocumentPanel renders every registered block type through the module registry.
 *
 * The gap this locks (handoff 2026-08-17): DocumentPanel hand-rolled its per-type
 * editors (text/todo/metric only), so a saved `table` block showed as an empty
 * shell with just a delete button — visible to the chat layer, invisible to the
 * human editor. The panel now dispatches through ModuleView (editable), so a new
 * module needs no DocumentPanel edit and edits flow through the debounced save.
 */

import React from 'react'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { justSaved } from '@/lib/templates/just-saved'
import {
  findTextBlock,
  queryAllTextBlocks,
  textEditorOf,
  writeInTextBlock,
} from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

// KAN-138: null by default (most tests render outside a PondProvider); the
// `yours · just saved` clear-on-apply tests below override it, since the real
// `justSaved` store needs a concrete pond id to key on.
const mockUsePondId = jest.fn<string | null, []>(() => null)
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => mockUsePondId(),
}))

// DocumentPanel reads the flat page tree for its own title/children lookups
// (parentTitle, breadcrumb path); per-test rows feed that, not any rendering.
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))

const mockListTemplates = jest.fn().mockResolvedValue([])
jest.mock('@/lib/templates/client', () => ({
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
const mockCreatePage = jest.fn()
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
const mockSaveProps = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: (...args: unknown[]) => mockSaveProps(...args),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn(), rememberPending: jest.fn() },
}))

const blocks: Block[] = [
  { id: 'b-text', type: 'text', content: 'Notes on the workbench build' },
  {
    id: 'b-table',
    type: 'table',
    title: 'Power Tools',
    columns: ['Tool', 'Location'],
    rows: [
      { id: 'r1', cells: ['Table Saw', 'Centre of shop'] },
      { id: 'r2', cells: ['Bandsaw', 'Left wall'] },
    ],
  },
]

function renderWith(page: Record<string, unknown>, rows: Record<string, unknown>[] = []) {
  mockGetPage.mockResolvedValue(page)
  mockFetchPages.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {/* ticket-27: block-delete undo reads the shared DeletionUndoProvider */}
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function renderPanel() {
  return renderWith({ id: 'page-1', title: 'Workshop', blocks })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUsePondId.mockReturnValue(null)
  justSaved.reset()
  mockListTemplates.mockResolvedValue([])
  mockCreatePage.mockResolvedValue({ id: 'made-1', type: 'page', title: 'untitled' })
  mockSaveBlocks.mockResolvedValue(undefined)
  mockSaveProps.mockResolvedValue(undefined)
})

describe('DocumentPanel block rendering (via the module registry)', () => {
  it('renders a text block in place as typeset prose — editable, with no source field', async () => {
    renderPanel()
    const field = await findTextBlock()
    expect(field).toHaveAttribute('contenteditable', 'true')
    expect(field).toHaveTextContent('Notes on the workbench build')
    expect(screen.queryByDisplayValue('Notes on the workbench build')).not.toBeInTheDocument()
  })

  it('persists a formatted text edit as markdown through the debounced save', async () => {
    renderPanel()
    const editor = textEditorOf(await findTextBlock())
    act(() => {
      editor.chain().selectAll().toggleBold().run()
    })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const [, , , savedBlocks, opts] = mockCommitBlocks.mock.calls[0]
    const text = (savedBlocks as Block[]).find((b) => b.id === 'b-text')
    expect(text).toEqual({
      id: 'b-text',
      type: 'text',
      content: '**Notes on the workbench build**',
    })
    expect(opts).toMatchObject({ ownEdit: true })
  })

  it('renders a saved table block with its cells, not an empty shell', async () => {
    renderPanel()
    expect(await screen.findByDisplayValue('Table Saw')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Centre of shop')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bandsaw')).toBeInTheDocument()
    // #237: the title is the block card's eyebrow (the view's own caption is
    // CSS-hidden under the frame, so both nodes exist in jsdom).
    expect(screen.getAllByText('Power Tools').length).toBeGreaterThan(0)
  })

  it('persists a table cell edit through the debounced save', async () => {
    renderPanel()
    const cell = await screen.findByDisplayValue('Table Saw')
    fireEvent.change(cell, { target: { value: 'Mitre Saw' } })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    const table = savedBlocks.find((b) => b.type === 'table')
    expect(table && table.type === 'table' && table.rows[0].cells[0]).toBe('Mitre Saw')
    // The edit is wholesale block state — the untouched rows must survive.
    expect(table && table.type === 'table' && table.rows[1].cells).toEqual(['Bandsaw', 'Left wall'])
  })

  // #98 review, BLOCKING 3. Renaming a page runs the same debounced save, which
  // carries `ownEdit` and therefore the outdated sweep. A title change is NOT an
  // edit to any diff's target, and `outdated` is one-way — it drops accept — so
  // a rename that swept the page would silently destroy every pending diff on
  // it. The guard is the blocks handed to the sweep: unchanged here, so
  // `markOutdated` spares every record whose `before` still matches them.
  it('a title-only rename saves the blocks UNCHANGED, so the sweep spares pending diffs', async () => {
    renderPanel()
    const titleInput = await screen.findByLabelText('Page title')
    fireEvent.change(titleInput, { target: { value: 'Workshop notes' } })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    expect(mockUpdateTitle).toHaveBeenCalledWith(expect.anything(), 'page-1', 'Workshop notes')
    const [, , , savedBlocks, opts] = mockCommitBlocks.mock.calls[0]
    // Still an own edit — the sweep runs; what makes the rename harmless is that
    // the blocks it is handed are byte-for-byte the ones the diffs were written
    // against.
    expect(opts).toMatchObject({ ownEdit: true })
    expect(savedBlocks).toEqual(blocks)
  })
})

const NOW = new Date().toISOString()
const tools = blocks[1]

// ── the `pages` group and the person's own templates ──────────────────

describe('the / menu on an empty page makes pages', () => {
  async function openSlash(typed: string) {
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    return { editor, typed }
  }

  const pick = async (editor: HTMLElement, query: string, name: string) => {
    // An empty page opens on its templates; typing a name returns to the blocks.
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, `/${query}`)
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    // The matched part of a label is its own span, so match the row by its whole
    // text — LAST match: a blank page's list leads with the premade templates
    // (KAN-276), so a label like `page` also names a template row earlier in the
    // list; the ordinary `pages`-group row this helper means is the one after it.
    const row = within(menu)
      .getAllByRole('option')
      .reverse()
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === name)!
    fireEvent.click(row)
  }

  it('`nested page` makes a child of this page and removes the `/…` line', async () => {
    renderWith({ id: 'page-1', parentId: 'root-1', type: 'page', title: 'Health', blocks: [] })
    const { editor } = await openSlash('nested')
    await pick(editor, 'nested', 'nested page')

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalled())
    expect(mockCreatePage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ parentId: 'page-1', type: 'page', title: 'untitled' })
    )
    await waitFor(() => expect(screen.queryByText(/^\/nested/)).not.toBeInTheDocument())
  })

  it('`page` makes a sibling: a child of this page’s own parent', async () => {
    renderWith({ id: 'page-1', parentId: 'root-1', type: 'page', title: 'Health', blocks: [] })
    const { editor } = await openSlash('page')
    await pick(editor, 'page', 'page')

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalled())
    expect(mockCreatePage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ parentId: 'root-1', title: 'untitled' })
    )
  })

  it('removes the `/…` block by id, so a block inserted above it during the awaits survives', async () => {
    renderWith({ id: 'page-1', parentId: 'root-1', type: 'page', title: 'Health', blocks: [tools] })
    const { editor } = await openSlash('page')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/page')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })

    // `page` is a sibling, so making it waits on the parent lookup — held here.
    let release: (page: unknown) => void = () => {}
    mockGetPage.mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'page')!
    fireEvent.click(row)
    await waitFor(() => expect(mockGetPage).toHaveBeenCalled())

    // While it waits, Return after the table puts a line above the `/…` block
    // and moves its index.
    const table = document.getElementById('block-b-table')!
    table.focus()
    fireEvent.keyDown(table, { key: 'Enter' })
    // The new line opens typeable, beside the `/page` block still waiting on its pick.
    await waitFor(() => expect(queryAllTextBlocks()).toHaveLength(2))
    expect(screen.getByText('/page')).toBeInTheDocument()

    release({ id: 'page-1', parentId: 'root-1', type: 'page', title: 'Health', blocks: [] })
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('/page')).not.toBeInTheDocument())
    const [survivor] = queryAllTextBlocks()
    expect(survivor).toHaveTextContent('')
  })

  it('a template of yours is listed under `yours` and applied whole, stamped once with where it came from', async () => {
    mockListTemplates.mockResolvedValue([
      {
        id: 't1',
        name: 'weeknight recipe',
        kind: 'page',
        origin: 'yours',
        createdAt: NOW,
        updatedAt: NOW,
        blocks: [{ id: 'old-1', type: 'text', content: 'chickpeas, harissa' }],
      },
    ])
    mockGetPage.mockResolvedValue({
      id: 'page-1',
      parentId: null,
      type: 'page',
      title: 'Health',
      blocks: [],
    })
    // KAN-138: `t1` was this session's just-saved lead — applying it retires that.
    mockUsePondId.mockReturnValue('pond-1')
    justSaved.set('pond-1', 't1')
    renderWith({ id: 'page-1', parentId: null, type: 'page', title: 'Health', blocks: [] })
    const { editor } = await openSlash('')
    expect(editor).toBeInTheDocument()
    fireEvent.click(await screen.findByText('weeknight recipe'))

    // A blank page's pick applies in place (KAN-124): this page's own blocks
    // become the template's stack, never a nested page.
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalled())
    expect(mockCreatePage).not.toHaveBeenCalled()
    const appliedBlocks = mockSaveBlocks.mock.calls[0][2]
    expect(appliedBlocks).toEqual([
      { id: expect.not.stringMatching(/^old-1$/), type: 'text', content: 'chickpeas, harissa' },
    ])
    await waitFor(() => expect(mockSaveProps).toHaveBeenCalled())
    expect(mockSaveProps.mock.calls[0][2]).toMatchObject({
      madeFromTemplate: { templateId: 't1', name: 'weeknight recipe' },
    })
    expect(justSaved.get('pond-1')).toBeNull()
  })

  it('a failed in-place apply leaves `yours · just saved` in place for a retry', async () => {
    mockListTemplates.mockResolvedValue([
      {
        id: 't1',
        name: 'weeknight recipe',
        kind: 'page',
        origin: 'yours',
        createdAt: NOW,
        updatedAt: NOW,
        blocks: [{ id: 'old-1', type: 'text', content: 'chickpeas, harissa' }],
      },
    ])
    mockGetPage.mockResolvedValue({
      id: 'page-1',
      parentId: null,
      type: 'page',
      title: 'Health',
      blocks: [],
    })
    mockUsePondId.mockReturnValue('pond-1')
    justSaved.set('pond-1', 't1')
    mockSaveBlocks.mockRejectedValueOnce(new Error('offline'))
    renderWith({ id: 'page-1', parentId: null, type: 'page', title: 'Health', blocks: [] })
    const { editor } = await openSlash('')
    expect(editor).toBeInTheDocument()
    fireEvent.click(await screen.findByText('weeknight recipe'))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalled())
    expect(justSaved.get('pond-1')).toBe('t1')
  })
})

describe('Return after a block, then `/`, lists what the `/` menu does', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  const yours = {
    id: 't1',
    name: 'weeknight recipe',
    kind: 'page',
    origin: 'yours',
    createdAt: NOW,
    updatedAt: NOW,
    blocks: [{ id: 'old-1', type: 'text', content: 'chickpeas' }],
  }

  const returnAfterTheTableThenSlash = async () => {
    await screen.findAllByRole('button', { name: 'Block menu' })
    const table = document.getElementById('block-b-table')!
    table.focus()
    fireEvent.keyDown(table, { key: 'Enter' })
    writeInTextBlock(await findTextBlock(), '/')
  }

  it('offers yours and applies one as a child page', async () => {
    mockListTemplates.mockResolvedValue([yours])
    // KAN-138: `t1` was this session's just-saved lead — applying it as a
    // nested page retires that too.
    mockUsePondId.mockReturnValue('pond-1')
    justSaved.set('pond-1', 't1')
    renderWith({ id: 'page-1', parentId: null, type: 'page', title: 'Health', blocks: [tools] })
    await returnAfterTheTableThenSlash()
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(
      within(menu)
        .getAllByRole('option')
        .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'page from template')!
    )
    fireEvent.click(await screen.findByText('weeknight recipe'))

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalled())
    expect(mockCreatePage.mock.calls[0][2]).toMatchObject({
      parentId: 'page-1',
      title: 'weeknight recipe',
    })
    expect(justSaved.get('pond-1')).toBeNull()
  })

  it('draws the mobile glass below the md breakpoint', async () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    renderWith({ id: 'page-1', parentId: null, type: 'page', title: 'Health', blocks: [tools] })
    await returnAfterTheTableThenSlash()
    await screen.findByRole('listbox', { name: 'blocks' })
    expect(document.querySelector('[data-part="glass"]')).toHaveClass('w-[340px]')
  })
})
