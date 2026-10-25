/**
 * KAN-536 path test A: the person's own path, start to finish, on the real
 * `BlockCanvas` — a page with no tasks database yet, through `/board` →
 * `tasks` → the new `project` step → a card typed into a lane, read back
 * from the fake store to prove it carries the project it was added under.
 * Harness mirrors `board-default-fields-path.test.tsx`'s real-`BlockCanvas`
 * precedent; the schema read-back mirrors
 * `block-canvas-new-database-options.test.tsx`'s.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { readSchema, ROW_TYPE } from '@/lib/properties/schema'
import { TASKS_ROLE } from '@/lib/pages/tasks-database'
import type { PageRow } from '@/lib/pages/tree'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { makeFakeSupabase } from './helpers/fake-supabase'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
const mockCreateClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

// ONE fake store for the whole file — the pass note for a later item reuses
// this same page's state across more than one `it`; this one `it` just
// reads it back once, at the end of its own walk.
const sb = makeFakeSupabase([])

/** `BlockCanvas` is controlled — a harness re-renders it with `onChange`'s
 *  next array, the same way the KAN-351 precedent's does. `pageTitle` is a
 *  parameter so a later `it` in this file can walk a second page. */
function Harness({ initial, pageTitle }: { initial: Block[]; pageTitle: string }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas blocks={blocks} pageId="page-1" pageTitle={pageTitle} onChange={setBlocks} />
  )
}

function renderCanvasWithClient(client: QueryClient, pageTitle: string, blocks: Block[] = []) {
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} pageTitle={pageTitle} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function renderCanvas(pageTitle: string, blocks: Block[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderCanvasWithClient(client, pageTitle, blocks)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateClient.mockReturnValue(sb)
  mockFetchPages.mockResolvedValue([])
})

/** `['pages']` as the real app would read it back off `store` — rows only
 *  (`ROW_TYPE` pages are records, never part of the lean tree `databasesOf`
 *  walks), so a later render's picker sees the role database (and its
 *  databases root) that an earlier step in the same test wrote for real. */
function pagesSnapshot(store: ReturnType<typeof makeFakeSupabase>): PageRow[] {
  return [...store._pages.values()]
    .filter((p) => p.type !== ROW_TYPE)
    .map((p) => ({
      id: p.id,
      parent_id: p.parent_id,
      type: p.type,
      title: p.title,
      order: p.order,
      updated_at: new Date().toISOString(),
      props: p.props,
    }))
}

async function openBlockMenu(slashCmd: string) {
  fireEvent.click(await screen.findByTestId('trailing-block-gap'))
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')
  await screen.findByRole('listbox', { name: 'blocks' })
  writeInTextBlock(editor, slashCmd)
  return screen.findByRole('listbox', { name: 'blocks' })
}

async function openBoardSource() {
  const menu = await openBlockMenu('/board')
  fireEvent.click(within(menu).getByRole('option', { name: 'board' }))
  return screen.findByRole('listbox', { name: '/board' })
}

async function openTableSource() {
  const menu = await openBlockMenu('/table')
  fireEvent.click(within(menu).getByText('table'))
  return screen.findByRole('listbox', { name: '/table' })
}

async function addTaskInLane(lane: HTMLElement, title: string) {
  fireEvent.click(within(lane).getByRole('button', { name: '＋ task' }))
  const page = await screen.findByLabelText('Record: Untitled')
  const titleInput = within(page).getByRole('textbox', { name: 'Record title' })
  fireEvent.change(titleInput, { target: { value: title } })
  fireEvent.keyDown(titleInput, { key: 'Enter' })
  await waitFor(() => {
    expect(within(lane).getByRole('textbox', { name: 'Card title' })).toHaveValue(title)
  })
}

describe('a board over the shared tasks database, filtered to its project (KAN-536)', () => {
  it('/board → tasks → new project lands a board whose added card carries the project', async () => {
    const { container } = renderCanvas('Home Reno')

    fireEvent.click(await screen.findByTestId('trailing-block-gap'))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/board')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByRole('option', { name: 'board' }))

    const source = await screen.findByRole('listbox', { name: '/board' })
    expect(within(source).getByText('tasks')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Enter' })

    const projectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    expect(within(projectStep).getByText('new project — Home Reno')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(await screen.findByText('tasks · Home Reno')).toBeInTheDocument()
    expect(screen.getByText('to do')).toBeInTheDocument()
    expect(screen.getByText('doing')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()

    const toDoLane = container.querySelector<HTMLElement>('[data-lane="to do"]')!
    fireEvent.click(within(toDoLane).getByRole('button', { name: '＋ task' }))

    const page = await screen.findByLabelText('Record: Untitled')
    const title = within(page).getByRole('textbox', { name: 'Record title' })
    fireEvent.change(title, { target: { value: 'buy tiles' } })
    fireEvent.keyDown(title, { key: 'Enter' })

    await waitFor(() => {
      expect(within(toDoLane).getByRole('textbox', { name: 'Card title' })).toHaveValue(
        'buy tiles'
      )
    })

    const database = [...sb._pages.values()].find((p) => p.props._role === TASKS_ROLE)!
    const projectField = readSchema(database.props)!.find((f) => f.name === 'project')!
    const option = projectField.options!.find((o) => o.label === 'Home Reno')!

    const record = [...sb._pages.values()].find(
      (p) => p.type === ROW_TYPE && p.parent_id === database.id
    )!
    expect((record.props as Record<string, unknown>)[projectField.id]).toBe(option.id)
  })

  it('a second project board is its own empty view; the first keeps only its own card; /table over the existing database shows both', async () => {
    const web = renderCanvas('Web design')

    const webSource = await openBoardSource()
    fireEvent.click(within(webSource).getByText('tasks'))
    const webProjectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    expect(within(webProjectStep).getByText('new project — Web design')).toBeInTheDocument()
    fireEvent.click(within(webProjectStep).getByText('new project — Web design'))

    expect(await screen.findByText('tasks · Web design')).toBeInTheDocument()
    expect(screen.queryByText('buy tiles')).not.toBeInTheDocument()

    const webToDoLane = web.container.querySelector<HTMLElement>('[data-lane="to do"]')!
    await addTaskInLane(webToDoLane, 'wireframes')

    // The shared database (and its root) now exist for real in `sb` — hand the
    // next render back what the real `fetchPages` would now read, so Home
    // Reno's picker offers `Home Reno` as an EXISTING option (no duplicate
    // `new project —` row) and `/table` lists the database at all.
    mockFetchPages.mockResolvedValue(pagesSnapshot(sb))
    web.unmount()

    const home = renderCanvas('Home Reno')
    const homeSource = await openBoardSource()
    // The existing role database is now ALSO titled `tasks` under "or view an
    // existing one" — two rows read `tasks`; the leading `new` row (which
    // opens the `project` step) is the first match, same distinction
    // `block-canvas-view-insert-undo-path.test.tsx`'s own KAN-536 case draws.
    const tasksRows = within(homeSource).getAllByRole('option', { name: /^tasks/ })
    fireEvent.click(tasksRows[0])
    const homeProjectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    // `Home Reno` already exists as an option (this page's own earlier `it`
    // minted it) — no `new project — Home Reno` row beside it.
    expect(within(homeProjectStep).queryByText('new project — Home Reno')).not.toBeInTheDocument()
    fireEvent.click(within(homeProjectStep).getByText('Home Reno'))

    expect(await screen.findByText('tasks · Home Reno')).toBeInTheDocument()
    await waitFor(() => {
      const cards = within(home.container).getAllByRole('textbox', { name: 'Card title' })
      expect(cards.map((c) => (c as HTMLInputElement).value)).toEqual(['buy tiles'])
    })
    expect(screen.queryByText('wireframes')).not.toBeInTheDocument()

    const tableSource = await openTableSource()
    fireEvent.click(within(tableSource).getByText('tasks'))

    await waitFor(() => {
      const titles = screen.getAllByLabelText('Row title') as HTMLInputElement[]
      expect(titles.map((t) => t.value).sort()).toEqual(['buy tiles', 'wireframes'])
    })
  })

  it('a double ↵ on a new project writes one option, not two (G9)', async () => {
    const soloSb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(soloSb)

    renderCanvas('Home Reno')
    const source = await openBoardSource()
    fireEvent.click(within(source).getByText('tasks'))
    const projectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    expect(within(projectStep).getByText('new project — Home Reno')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(await screen.findByText('tasks · Home Reno')).toBeInTheDocument()

    const database = [...soloSb._pages.values()].find((p) => p.props._role === TASKS_ROLE)!
    const projectField = readSchema(database.props)!.find((f) => f.name === 'project')!
    expect(projectField.options).toHaveLength(1)
    expect(projectField.options![0].label).toBe('Home Reno')
    expect([...soloSb._pages.values()].filter((p) => p.props._role === TASKS_ROLE)).toHaveLength(1)
  })

  it('a second project board made within the app-wide staleTime keeps its own card (KAN-536)', async () => {
    const soloSb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(soloSb)
    // The real app shares ONE `QueryClient` across every page, with a 30s
    // staleTime (providers.tsx:12) — reproduce both, or the bug (the second
    // board reading the `['page', tasksId]` schema as it stood before this
    // page's own project-option write) never shows: every other `it` in this
    // file makes a fresh client per `renderCanvas` call, which masks it.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30 * 1000 } },
    })

    const home = renderCanvasWithClient(client, 'Home Reno')
    const homeSource = await openBoardSource()
    fireEvent.click(within(homeSource).getByText('tasks'))
    const homeProjectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    fireEvent.click(within(homeProjectStep).getByText('new project — Home Reno'))
    expect(await screen.findByText('tasks · Home Reno')).toBeInTheDocument()
    const homeToDoLane = home.container.querySelector<HTMLElement>('[data-lane="to do"]')!
    await addTaskInLane(homeToDoLane, 'buy tiles')
    home.unmount()

    const web = renderCanvasWithClient(client, 'Web design')
    const webSource = await openBoardSource()
    fireEvent.click(within(webSource).getByText('tasks'))
    const webProjectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    fireEvent.click(within(webProjectStep).getByText('new project — Web design'))
    expect(await screen.findByText('tasks · Web design')).toBeInTheDocument()

    const webToDoLane = web.container.querySelector<HTMLElement>('[data-lane="to do"]')!
    await addTaskInLane(webToDoLane, 'wireframes')
  })
})
