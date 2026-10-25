/**
 * FEATURE — pages & blocks: the authoring write path, end to end.
 *
 * One test per happy path a person actually walks, asserted on the OUTCOME: what
 * landed in the `pages` row, what the shared `['pages']` tree (the rail's own
 * cache) then holds, and what the panel says next. Appearance is Storybook's job
 * now — nothing here asserts a colour, a size or a frame.
 *
 * The paths (boards `Pond 06.07 Add a block mid-page`, `Pond 06.10 List into table`):
 *   1. edit a block → debounced autosave → the whole array persists → the tree refetches
 *   2. Return after a block, then `/`, inserts a block MID-page, right after it
 *   3. `/` in an empty text block swaps that block for the picked one, in place
 *   4. `/table` mints NO freeform table — it asks which database first
 *   5. `turn into › table` on a list makes a REAL database + a `view` over it
 *
 * `Pond 06.11 Nest a page from a block` is NOT built — see the note at the foot.
 *
 * Everything below the component is real: `getPage`, `createPage`, `deletePage`,
 * `createDatabaseFromList`, `createDatabase`, the schema inference, `commitBlocks`.
 * Three seams are stood in for:
 *   • `saveBlocks` / `updateTitle` — the shared `fake-supabase` builder has no
 *     `.update()`, so a two-line adapter applies their patch to its `_pages` map.
 *     The assertions still read the row, not the call.
 *   • `recordOwnEdit` — spied rather than run, so the own-edit contract (the
 *     outdated sweep and the accepted record) is asserted without turning it loose
 *     on a fake whose `from()` serves one table.
 *   • `fetchPages` / `getOrCreateHomePage` — `fetchPages` is DERIVED from the fake's
 *     rows, so "the tree the rail reads" is the real written state, not a fixture.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { DATABASES_ROOT_TITLE, isDatabasesRoot } from '@/lib/pages/databases-root'
import { ROW_TYPE, readSchema } from '@/lib/properties/schema'
import type { Block } from '@/lib/documents/types'
import { makeFakeSupabase, type Row } from './helpers/fake-supabase'
import { queryAllTextBlocks, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

/** The one in-memory database every path below writes into. Rebuilt per test. */
let db: ReturnType<typeof makeFakeSupabase>
jest.mock('@/lib/supabase/client', () => ({ createClient: () => db }))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: () => Promise.resolve({ id: 'home-1', title: 'life', blocks: [] }),
}))

/**
 * The two writers that go through `.update()`, which the shared harness's builder
 * does not implement. They apply the patch to the harness's own map, so the row
 * the test reads afterwards is the row the app wrote.
 */
const mockSaveBlocks = jest.fn(async (_sb: unknown, id: string, blocks: Block[]) => {
  const row = db._pages.get(id)
  if (row) row.blocks = blocks
})
const mockUpdateTitle = jest.fn(async (_sb: unknown, id: string, title: string) => {
  const row = db._pages.get(id)
  if (row) row.title = title
})
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...(args as [unknown, string, Block[]])),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...(args as [unknown, string, string])),
}))

const mockRecordOwnEdit = jest.fn().mockResolvedValue({ logged: Promise.resolve() })
jest.mock('@/lib/change-log/own-edit', () => ({
  recordOwnEdit: (...args: unknown[]) => mockRecordOwnEdit(...args),
}))

// ── fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString()

const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
const tools: Block = {
  id: 'b-table',
  type: 'table',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
}
const heading: Block = { id: 'b-heading', type: 'text', content: '## ingredients' }
const ingredients: Block = {
  id: 'b-list',
  type: 'text',
  content: '- 500g strong white flour\n- 350g water\n- 100g levain\n- 10g salt',
}

const hostPage = (blocks: Block[]): Row => ({
  id: 'page-1',
  user_id: 'user-1',
  pond_id: null,
  parent_id: null,
  type: 'page',
  title: 'kitchen renovation',
  blocks,
  props: {},
  order: 0,
})

/** The host page's blocks as they are stored — the thing every path is judged on. */
const persisted = (): Block[] => (db._pages.get('page-1')!.blocks as Block[]) ?? []

/** Every non-record page in the fake, which is what the rail's tree is built from. */
const tree = () => mockFetchPages.mock.results.at(-1)?.value as Promise<{ title: string }[]>

/** A databases root plus one database, seeded for the tests that pick an existing source. */
const databaseSeed = (id: string, title: string): Row[] => [
  {
    id: 'root',
    user_id: 'user-1',
    pond_id: null,
    parent_id: null,
    type: 'page',
    title: DATABASES_ROOT_TITLE,
    blocks: [],
    props: {},
    order: 0,
  },
  {
    id,
    user_id: 'user-1',
    pond_id: null,
    parent_id: 'root',
    type: 'database',
    title,
    blocks: [],
    props: {},
    order: 0,
  },
]

/** An option by its exact label, across the `pre` / `hit` / `post` split a query leaves it in. */
const rowNamed = (menu: HTMLElement, name: string) =>
  within(menu)
    .getAllByRole('option')
    .find((o) => o.querySelector('[data-part="label"]')?.textContent === name)

function mount(blocks: Block[], seed: Row[] = []) {
  db = makeFakeSupabase([hostPage(blocks), ...seed])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(DeletionUndoProvider, null, React.createElement(DocumentPanel))
    )
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  // jsdom has no `fetch`. `propagateBlockWrite` fires an embed ping and forgets,
  // and the glyph marks fetch their svg masks; neither is this slice's subject.
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']),
  }) as unknown as typeof fetch
  // Derived, not fixed: the tree reflects whatever has actually been written.
  mockFetchPages.mockImplementation(async () =>
    [...db._pages.values()]
      .filter((r) => r.type !== ROW_TYPE)
      .map((r) => ({
        id: r.id,
        parent_id: r.parent_id,
        type: r.type,
        title: r.title,
        order: r.order,
        updated_at: NOW,
      }))
  )
})

/** "Return after the table, then /": the `/` menu, on a new line after the block. */
async function returnAfterThenSlash(blockId: string) {
  await screen.findAllByRole('button', { name: /drag to move/i })
  const block = document.getElementById(`block-${blockId}`)!
  block.focus()
  fireEvent.keyDown(block, { key: 'Enter' })
  const line = await waitFor(() => {
    const el = queryAllTextBlocks().find((field) => field.textContent === '')
    if (!el) throw new Error('no new line to type into')
    return el
  })
  writeInTextBlock(line, '/')
  return screen.findByRole('listbox', { name: 'blocks' })
}

// ── 1. editing a block autosaves, persists, and the tree refetches ──────────

describe('a block edit autosaves', () => {
  it('persists the WHOLE array, sweeps the page’s pending diffs as an own edit, and settles on "saved"', async () => {
    mount([note, tools])
    const refetchesBefore = mockFetchPages.mock.calls.length

    fireEvent.change(await screen.findByDisplayValue('Saw'), {
      target: { value: 'Mitre saw' },
    })
    // The person sees it is unsaved while the debounce runs.
    expect(await screen.findByText('saving…')).toBeInTheDocument()

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalled(), { timeout: 3000 })
    // Blocks are never partially persisted: the untouched text block rides along.
    expect(persisted()).toHaveLength(2)
    expect(persisted()[0]).toEqual(note)
    const table = persisted()[1]
    expect(table.type === 'table' && table.rows[0].cells).toEqual(['Mitre saw', 'Wall'])

    // G2 (#98): the page moved under the person's own hand, so its pending block
    // diffs go outdated — scoped to the blocks that landed, not to the save — and
    // the save is logged from what the page held before it.
    expect(mockRecordOwnEdit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pageId: 'page-1', before: [note, tools], blocks: persisted() })
    )
    // The shared ['pages'] tree — what the rail draws from — is refetched.
    expect(mockFetchPages.mock.calls.length).toBeGreaterThan(refetchesBefore)
    expect(await screen.findByText(/^saved \d{2}:\d{2}$/)).toBeInTheDocument()
  })
})

// ── 2. a block arrives mid-page: Return after the table, then / (06.07) ─────

describe('Return after the table, then / inserts a block mid-page (06.07)', () => {
  // Every case is the same gesture after the same block; only the row picked
  // differs, and with it the preset that row mints.
  test.each([
    ['checklist', { type: 'todo', items: [{ label: '', checked: false }] }],
    ['list', { type: 'todo', marker: 'dot' }],
    ['heading', { type: 'text', content: '## ' }],
    ['entry log', { type: 'entries', entries: [] }],
  ])('↵ %s lands its preset BETWEEN the two blocks and persists there', async (label, shape) => {
    mount([tools, note])
    const menu = await returnAfterThenSlash('b-table')
    fireEvent.click(within(menu).getByText(label))

    await waitFor(() => expect(persisted()[1]).toMatchObject(shape), { timeout: 3000 })
    // In place: the new block took the line after the table, and its neighbours did not move.
    expect(persisted().map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-note'])
    expect(persisted()[0]).toEqual(tools)
    expect(persisted()[2]).toEqual(note)
  })
})

// ── 3. the / menu swaps the block it was typed in ───────────────────────────

describe('the / menu inserts a block', () => {
  it('replaces the `/…` text block in place, so the slash itself never survives the save', async () => {
    mount([note, { id: 'b-empty', type: 'text', content: '' }])
    const typing = await waitFor(() => {
      const el = queryAllTextBlocks().find((field) => field.textContent === '')
      if (!el) throw new Error('no empty text block to type into')
      return el
    })

    writeInTextBlock(typing, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByText('heading'))

    await waitFor(() => expect(persisted()[1]).toMatchObject({ type: 'text', content: '## ' }), {
      timeout: 3000,
    })
    expect(persisted()).toHaveLength(2)
    expect(persisted()[0]).toEqual(note)
    // The `/` block was swapped, not kept beside its replacement.
    expect(persisted().some((b) => b.id === 'b-empty')).toBe(false)
    expect(persisted().some((b) => b.type === 'text' && b.content === '/')).toBe(false)
  })

  // The silent failure this guards: `/table` minting a freeform `table` block
  // would look right on screen and quietly break "a table is always a view of a
  // database" (PROJECT_RULES, AUDIT § Decided 26 sep 6j) — a grid with no records
  // behind it, chartable by nothing.
  it('`/table` mints no freeform table — it asks which database first', async () => {
    mount([note, { id: 'b-empty', type: 'text', content: '' }])
    const typing = await waitFor(() => {
      const el = queryAllTextBlocks().find((field) => field.textContent === '')
      if (!el) throw new Error('no empty text block to type into')
      return el
    })
    writeInTextBlock(typing, '/')
    fireEvent.click(
      within(await screen.findByRole('listbox', { name: 'blocks' })).getByText('table')
    )

    expect(await screen.findByRole('listbox', { name: '/table' })).toBeInTheDocument()
    // The `/` line is saved as typed; nothing table-shaped reaches the page.
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalled(), { timeout: 3000 })
    expect(persisted()).toEqual([note, { id: 'b-empty', type: 'text', content: '/' }])
  })

  // The static freeform table's own row (KAN-240), never read alike `/table`'s
  // database view: picking it lands the grid directly, with no source picker.
  it('`/grid` mints the freeform table block directly — no source picker', async () => {
    mount([note, { id: 'b-empty', type: 'text', content: '' }])
    const typing = await waitFor(() => {
      const el = queryAllTextBlocks().find((field) => field.textContent === '')
      if (!el) throw new Error('no empty text block to type into')
      return el
    })
    writeInTextBlock(typing, '/')
    fireEvent.click(
      within(await screen.findByRole('listbox', { name: 'blocks' })).getByText('grid')
    )

    await waitFor(() => expect(persisted()[1]?.type).toBe('table'), { timeout: 3000 })
    expect(persisted()[1]).toMatchObject({ type: 'table', columns: ['Column 1', 'Column 2'] })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  // `/list`'s view row (KAN-240) collides in word with the bulleted list: both
  // must survive the query, labelled distinctly, and the view row still routes
  // through the source picker like every other view kind.
  it('`/list` is the list view, labelled distinctly from the bulleted list', async () => {
    mount([note, { id: 'b-empty', type: 'text', content: '' }], databaseSeed('db-recipes', 'recipes'))
    const typing = await waitFor(() => {
      const el = queryAllTextBlocks().find((field) => field.textContent === '')
      if (!el) throw new Error('no empty text block to type into')
      return el
    })
    writeInTextBlock(typing, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(typing, '/list')

    await waitFor(() => {
      expect(rowNamed(menu, 'list')).toBeDefined()
      expect(rowNamed(menu, 'list view')).toBeDefined()
    })
    fireEvent.click(rowNamed(menu, 'list view')!)

    const picker = await screen.findByRole('listbox', { name: '/list' })
    fireEvent.click(await within(picker).findByRole('option', { name: /recipes/ }))

    await waitFor(
      () =>
        expect(persisted()[1]).toMatchObject({
          type: 'view',
          mode: 'list',
          collectionId: 'db-recipes',
        }),
      { timeout: 3000 }
    )
  })

  // #big-number's acceptance bug (KAN-240): a view with no source is not a view,
  // so `/big number` now opens the source picker like every other view kind.
  it('`/big number` opens the source picker before landing a view', async () => {
    mount([note, { id: 'b-empty', type: 'text', content: '' }], databaseSeed('db-recipes', 'recipes'))
    const typing = await waitFor(() => {
      const el = queryAllTextBlocks().find((field) => field.textContent === '')
      if (!el) throw new Error('no empty text block to type into')
      return el
    })
    writeInTextBlock(typing, '/')
    fireEvent.click(
      within(await screen.findByRole('listbox', { name: 'blocks' })).getByText('big number')
    )

    const picker = await screen.findByRole('listbox', { name: '/big number' })
    fireEvent.click(await within(picker).findByRole('option', { name: /recipes/ }))

    await waitFor(
      () =>
        expect(persisted()[1]).toMatchObject({
          type: 'view',
          mode: 'big-number',
          collectionId: 'db-recipes',
        }),
      { timeout: 3000 }
    )
  })
})

// ── 4. list → turn into › table (06.10) ─────────────────────────────────────

describe('turn into › table makes a database, never a freeform table (06.10)', () => {
  it('writes a real database with records under `databases`, and leaves the page a view over it', async () => {
    mount([heading, ingredients])
    const handles = await screen.findAllByRole('button', { name: /drag to move/i })
    fireEvent.contextMenu(handles[1].closest('[id^="block-"]')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /table/i }))

    // The host page: the list is gone, a `view` sits exactly where it was.
    await waitFor(() => expect(persisted()[1]?.type).toBe('view'), { timeout: 3000 })
    const view = persisted()[1]
    expect(persisted().map((b) => b.id)).toEqual(['b-heading', view.id])
    expect(persisted()[0]).toEqual(heading)
    // NOT a freeform table block, here or anywhere.
    expect(persisted().some((b) => b.type === 'table')).toBe(false)
    expect(view).toMatchObject({ type: 'view', mode: 'table' })

    // …and a REAL database behind it: filed under the `databases` root, with the
    // list's lines as `row` records and fields inside the 8 property types.
    const collectionId = view.type === 'view' ? view.collectionId : undefined
    const database = db._pages.get(collectionId!)!
    expect(database.title).toBe('ingredients') // named after the heading above it
    const root = db._pages.get(database.parent_id!)!
    expect(isDatabasesRoot({ parentId: root.parent_id, title: root.title })).toBe(true)
    expect(root.title).toBe(DATABASES_ROOT_TITLE)
    expect(readSchema(database.props)!.map((d) => [d.name, d.type])).toEqual([
      ['amount', 'number'],
      ['unit', 'text'],
      ['item', 'text'],
    ])
    const records = [...db._pages.values()].filter((r) => r.type === ROW_TYPE)
    expect(records).toHaveLength(4)
    expect(records.every((r) => r.parent_id === collectionId)).toBe(true)
    expect(records.map((r) => r.title)).toContain('strong white flour')

    // The rail's own tree now lists the root and the database under it.
    const rows = await tree()
    expect(rows.map((r) => r.title)).toEqual(
      expect.arrayContaining([DATABASES_ROOT_TITLE, 'ingredients'])
    )
  })
})

// ── Pond 06.11 Nest a page from a block — NOT BUILT ─────────────────────────
//
// Read for, not found. 6k needs four things and the build has none of them:
//   • a `move into a new page` item on the block menu — `blockMenuGroups` in
//     `BlockCanvas.tsx` offers `turn into`, `copy link to block` and `delete`;
//   • section selection ("the handle selects the heading and every block under
//     it") — no `section` concept exists; a handle carries one block;
//   • a page-link block to leave behind in the same place — the `page` module is
//     a structural container, there is no link block, and `palette.ts` says in so
//     many words that the board's `page link` / `nested page` rows have no factory
//     (ADR 0005, #281);
//   • `/ nested page` on an empty line — the same withheld rows.
// The nearest built thing is `page from template › ↵ new nested page` (#278,
// `makeNestedPageFromTemplate`), which creates a nested page from a TEMPLATE and
// moves no existing blocks into it. Nothing is asserted here.
