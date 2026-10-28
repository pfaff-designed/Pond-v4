/**
 * KAN-368 — `onSourcePick`'s view placement writes through `persistBlocksAsOwnEdit`
 * for both branches. The new-database branch's step carries `onUndone`/`onRedone`
 * side effects that trash/restore the database it made (ticket comment 10238: ⌘Z
 * right after inserting a view must take the database back too); the existing-
 * database branch carries neither. Harness mirrors
 * `block-canvas-new-database-options.test.tsx` (the real `BlockCanvas`, real
 * `createDatabase` against `makeFakeSupabase`) — `saveBlocks`/`appendOwnEdit` are
 * mocked (same shape as the other KAN-368 undo-path tests) so a sparse
 * change-log row never has to round-trip `mapChangeLogRow`; `trashPage`/
 * `restorePage` are mocked so the assertion is "was it called", not the RPC's own
 * job. `sessionUndo.undo` is called directly — this item is the engine's side
 * effect wiring, not the ⌘Z key binding, which the other KAN-368 path tests
 * already cover.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import { trashPage, restorePage } from '@/lib/change-log/trash'
import { listRecords } from '@/lib/change-log/store'
import type { Block } from '@/lib/documents/types'
import { createPageWriter, type PageWriteState } from '@/lib/pages/commit'
import { createPageWriteQueue } from '@/lib/pages/page-write-queue'
import type { PageRow } from '@/lib/pages/tree'
import { readSchema } from '@/lib/properties/schema'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { makeFakeSupabase } from './helpers/fake-supabase'
import { rowByLabel } from './helpers/slash-menu'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const mockCreateClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))

let recordSeq = 0
const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  listRecords: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn().mockResolvedValue(undefined),
  restorePage: jest.fn().mockResolvedValue(undefined),
}))

// `session-undo.ts` stays real: this proves the view-insert's `rememberPending`
// and its `onUndone`/`onRedone` side effects run off one real stack. Only the
// RPC boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  const queryClient = useQueryClient()
  const queueRef = React.useRef<ReturnType<typeof createPageWriteQueue<PageWriteState>> | null>(
    null
  )

  const onStructuralWrite = async (
    next: Block[],
    opts?: {
      onUndone?: () => Promise<void> | void
      onRedone?: () => Promise<void> | void
    }
  ) => {
    setBlocks(next)
    if (!queueRef.current) {
      queueRef.current = createPageWriteQueue(
        createPageWriter(mockCreateClient(), queryClient, 'page-1', 'pond-1'),
        {
          title: 'trip planning',
          blocks: initial,
        }
      )
    }
    let resolveIds: (ids: readonly string[] | null) => void = () => {}
    const recordIds = new Promise<readonly string[] | null>((resolve) => {
      resolveIds = resolve
    })
    sessionUndo.rememberPending({
      pondId: 'pond-1',
      recordIds,
      onUndone: opts?.onUndone,
      onRedone: opts?.onRedone,
    })
    await queueRef.current.enqueue({
      kind: 'structural',
      after: { title: 'trip planning', blocks: next },
      onPending: resolveIds,
    })
    return true
  }

  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="trip planning"
      onChange={setBlocks}
      onStructuralWrite={onStructuralWrite}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  recordSeq = 0
  mockFetchPages.mockResolvedValue([])
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  jest.mocked(redoStep).mockResolvedValue({ outcome: 'done', records: [] })
  sessionUndo.clear()
})

/** Opens `/table` on an empty page. `new database — <page>` is preselected
 *  when no databases exist; the caller picks that row or an existing one. */
async function openTableSource(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('trailing-block-gap'))
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')
  await screen.findByRole('listbox', { name: 'blocks' })
  writeInTextBlock(editor, '/table')
  const menu = await screen.findByRole('listbox', { name: 'blocks' })
  fireEvent.click(rowByLabel(menu, 'table'))
  return screen.findByRole('listbox', { name: '/table' })
}

/** Opens `/board` on an empty page. `tasks` is preselected when no databases
 *  exist; ↵ there opens the `project` step (KAN-536). */
async function openBoardSource(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('trailing-block-gap'))
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')
  await screen.findByRole('listbox', { name: 'blocks' })
  writeInTextBlock(editor, '/board')
  const menu = await screen.findByRole('listbox', { name: 'blocks' })
  // `rowByLabel`, not a raw `getByRole` name match: a row's accessible name
  // picks up its own sibling "↵" hint once the row is the active one (KAN-554
  // surfaced this calling `openBoardSource` twice in one test — the second
  // call's row is pre-selected and so its full name is "board ↵").
  fireEvent.click(rowByLabel(menu, 'board'))
  return screen.findByRole('listbox', { name: '/board' })
}

/** Types into the `project` step's own typeahead (no `<input>` — the glass
 *  reads printable keys off `document`, per `SourcePicker.tsx`), so a second
 *  `/board` on the same page can mint a DIFFERENTLY-named option than the
 *  page title's preselected row (KAN-554's cross-contamination case needs
 *  two distinct options on one page). */
function typeProjectQuery(text: string) {
  for (const key of text) fireEvent.keyDown(document, { key })
}

/** Files a card into `lane` by title (KAN-536's own helper, mirrored here so
 *  the sibling undo case can put a record on the minted project BEFORE
 *  undoing, same as `board-project-tasks-path.test.tsx`'s `addTaskInLane`). */
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

describe('a view insert writes one ⌘Z step whose side effects match its database (KAN-368)', () => {
  it('undoing a view onto a NEW database trashes that database', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([])
    await openTableSource()
    // `new database — <page>` leads the `source` step; ↵ opens the `new`
    // (field) step, prefilled but unfinished — a second ↵ there creates it.
    fireEvent.keyDown(document, { key: 'Enter' })
    await screen.findByRole('listbox', { name: 'new database — trip planning' })
    fireEvent.keyDown(document, { key: 'Enter' })

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    const database = [...sb._pages.values()].find((p) => p.parent_id !== null)!
    expect(database).toBeDefined()

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(1))
    expect(trashPage).toHaveBeenCalledWith(expect.anything(), database.id)
    expect(restorePage).not.toHaveBeenCalled()

    // ⇧⌘Z brings the database back, then ⌘Z must trash it again (KAN-496):
    // the redo-rebuilt step on the undo stack has to keep carrying onUndone.
    jest.mocked(listRecords).mockResolvedValueOnce([{ id: 'record-trash-1' } as never])
    await sessionUndo.redo('pond-1')
    await waitFor(() => expect(restorePage).toHaveBeenCalledTimes(1))
    expect(restorePage).toHaveBeenCalledWith(expect.anything(), 'record-trash-1')

    await sessionUndo.undo('pond-1')
    await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(2))
    expect(trashPage).toHaveBeenLastCalledWith(expect.anything(), database.id)
    expect(restorePage).toHaveBeenCalledTimes(1)
  })

  it('undoing a view onto an EXISTING database leaves it alone', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)
    const now = new Date().toISOString()
    const rootRow: PageRow = {
      id: 'root-db',
      parent_id: null,
      type: 'page',
      title: 'databases',
      order: 9,
      updated_at: now,
    }
    const dbRow: PageRow = {
      id: 'db-1',
      parent_id: 'root-db',
      type: 'page',
      title: 'tasks',
      order: 0,
      updated_at: now,
    }
    mockFetchPages.mockResolvedValue([rootRow, dbRow])

    renderCanvas([])
    const source = await openBoardSource()
    // The board's own `new` row also reads `tasks` (KAN-536) — the existing
    // database named `tasks` is the one under "or view an existing one",
    // the LAST of the two matches rather than the leading `new` row.
    const tasksOptions = within(source).getAllByRole('option', { name: /^tasks/ })
    fireEvent.click(tasksOptions[tasksOptions.length - 1])

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(trashPage).not.toHaveBeenCalled()
    expect(restorePage).not.toHaveBeenCalled()
  })

  it('undoing a view onto the shared TASKS database removes the block, never trashes it (KAN-536)', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([])
    const source = await openBoardSource()
    fireEvent.click(within(source).getByRole('option', { name: /^tasks/ }))
    const projectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    fireEvent.click(within(projectStep).getByText('new project — trip planning'))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalled())
    expect(await screen.findByText('tasks · trip planning')).toBeInTheDocument()
    const database = [...sb._pages.values()].find((p) => p.props._role === 'tasks')
    expect(database).toBeDefined()
    const projectField = readSchema(database!.props)!.find((f) => f.name === 'project')!
    const option = projectField.options!.find((o) => o.label === 'trip planning')!
    expect(option).toBeDefined()

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(trashPage).not.toHaveBeenCalled()
    expect(restorePage).not.toHaveBeenCalled()

    // PATH_STEP 2 (KAN-554): the view block itself is gone, the minted option
    // is gone from the schema, and the shared tasks database page is untouched.
    await waitFor(() => expect(screen.queryByText('tasks · trip planning')).not.toBeInTheDocument())
    expect(sb._pages.has(database!.id)).toBe(true)
    const schemaAfterUndo = readSchema(database!.props)!
    const projectFieldAfterUndo = schemaAfterUndo.find((f) => f.name === 'project')!
    expect((projectFieldAfterUndo.options ?? []).some((o) => o.id === option.id)).toBe(false)
  })

  it('undoing a view onto the shared TASKS database keeps the minted option when a task already uses it (KAN-554)', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    const { container } = renderCanvas([])
    const source = await openBoardSource()
    fireEvent.click(within(source).getByRole('option', { name: /^tasks/ }))
    const projectStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    fireEvent.click(within(projectStep).getByText('new project — trip planning'))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalled())
    const database = [...sb._pages.values()].find((p) => p.props._role === 'tasks')
    expect(database).toBeDefined()
    const projectField = readSchema(database!.props)!.find((f) => f.name === 'project')!
    const option = projectField.options!.find((o) => o.label === 'trip planning')!
    expect(option).toBeDefined()

    expect(await screen.findByText('tasks · trip planning')).toBeInTheDocument()
    const toDoLane = container.querySelector<HTMLElement>('[data-lane="to do"]')!
    await addTaskInLane(toDoLane, 'pack bags')

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(trashPage).not.toHaveBeenCalled()
    expect(restorePage).not.toHaveBeenCalled()

    // A record still carries the minted option — undo must leave it alone.
    const schemaAfterUndo = readSchema(database!.props)!
    const projectFieldAfterUndo = schemaAfterUndo.find((f) => f.name === 'project')!
    expect(projectFieldAfterUndo.options!.some((o) => o.id === option.id)).toBe(true)
  })

  it('undoing the FIRST of two sequential new-project boards drops only its own option, never the later one (KAN-554)', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)
    const rememberSpy = jest.spyOn(sessionUndo, 'rememberPending')

    renderCanvas([])

    // Garden — minted first.
    const gardenSource = await openBoardSource()
    fireEvent.click(within(gardenSource).getByRole('option', { name: /^tasks/ }))
    const gardenStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    typeProjectQuery('garden')
    fireEvent.click(within(gardenStep).getByText('new project — garden'))
    expect(await screen.findByText('tasks · garden')).toBeInTheDocument()
    await waitFor(() => expect(rememberSpy).toHaveBeenCalledTimes(1))

    // Kitchen — minted second, onto the schema Garden's own option already sits in.
    const kitchenSource = await openBoardSource()
    fireEvent.click(within(kitchenSource).getByRole('option', { name: /^tasks/ }))
    const kitchenStep = await screen.findByRole('listbox', { name: '/board — tasks' })
    typeProjectQuery('kitchen')
    fireEvent.click(within(kitchenStep).getByText('new project — kitchen'))
    expect(await screen.findByText('tasks · kitchen')).toBeInTheDocument()
    await waitFor(() => expect(rememberSpy).toHaveBeenCalledTimes(2))

    const database = [...sb._pages.values()].find((p) => p.props._role === 'tasks')!
    const projectField = readSchema(database.props)!.find((f) => f.name === 'project')!
    const gardenOption = projectField.options!.find((o) => o.label === 'garden')!
    const kitchenOption = projectField.options!.find((o) => o.label === 'kitchen')!
    expect(gardenOption).toBeDefined()
    expect(kitchenOption).toBeDefined()

    // The FIRST insert's own `onUndone` — called directly, the same way a ⌘Z
    // that actually reached the stack's bottom step would, without needing to
    // first pop Kitchen's still-live step off the top (session-undo is LIFO;
    // this reaches past that to the one callback the fix touches).
    const gardenOnUndone = rememberSpy.mock.calls[0][0].onUndone!
    await gardenOnUndone()

    const schemaAfterUndo = readSchema(database.props)!
    const projectFieldAfterUndo = schemaAfterUndo.find((f) => f.name === 'project')!
    expect(projectFieldAfterUndo.options!.some((o) => o.id === gardenOption.id)).toBe(false)
    expect(projectFieldAfterUndo.options!.some((o) => o.id === kitchenOption.id)).toBe(true)
  })
})
