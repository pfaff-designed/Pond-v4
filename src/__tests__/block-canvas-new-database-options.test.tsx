/**
 * KAN-351: `BlockCanvas`'s `onSourcePick` → `createDatabase` schema mapping must
 * carry a picked field's `options` (minting an id per field AND per option),
 * not drop them — the hop that turns the picker's default `status` field into
 * lanes a board can actually group by. Harness mirrors `calendar-path.test.tsx`
 * (the real `BlockCanvas`, not a bare picker); assertions mirror
 * `feature-databases.test.ts`'s "making a new database" test, against the same
 * `makeFakeSupabase` fake, reading the write back with `readSchema`.
 *
 * KAN-536: `/board` → `tasks` now opens a `project` step first (one shared
 * tasks database per pond, filtered per board) — the first describe below
 * walks that step, and a second proves a later `/board` on another page
 * reuses the same role database rather than minting a second one.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import {
  DEFAULT_STATUS_OPTIONS,
  readSchema,
  withSchema,
  type PropertySchema,
} from '@/lib/properties/schema'
import { TASKS_ROLE } from '@/lib/pages/tasks-database'
import type { PageRow } from '@/lib/pages/tree'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { makeFakeSupabase, type Row } from './helpers/fake-supabase'

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
// The option write's own `edit_schema` change-log record — mocked the same
// way `block-canvas-view-insert-undo-path.test.tsx` mocks it, so a sparse row
// never has to round-trip `mapChangeLogRow`, and the fake `pages` table never
// sees an insert meant for a different table.
const mockAppendOwnEdit = jest.fn().mockResolvedValue({})
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

/** `BlockCanvas` is controlled — a harness re-renders it with `onChange`'s next
 *  array, the same way `calendar-path.test.tsx`'s does. */
function Harness({ initial, pageId, pageTitle }: { initial: Block[]; pageId: string; pageTitle: string }) {
  const [blocks, setBlocks] = React.useState(initial)
  return <BlockCanvas blocks={blocks} pageId={pageId} pageTitle={pageTitle} onChange={setBlocks} />
}

function renderCanvas(blocks: Block[], page: { id: string; title: string } = { id: 'page-1', title: 'trip planning' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} pageId={page.id} pageTitle={page.title} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([])
})

/** Opens `/board` on the already-rendered page and picks the `tasks` row —
 *  shared by every test below, through the `project` step it now leads to. */
async function openBoardTasks() {
  fireEvent.click(await screen.findByTestId('trailing-block-gap'))
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')
  await screen.findByRole('listbox', { name: 'blocks' })
  writeInTextBlock(editor, '/board')
  const menu = await screen.findByRole('listbox', { name: 'blocks' })
  fireEvent.click(within(menu).getByRole('option', { name: 'board' }))

  const picker = await screen.findByRole('listbox', { name: '/board' })
  fireEvent.click(within(picker).getByText('tasks'))
  return screen.findByRole('listbox', { name: '/board — tasks' })
}

describe('`/board` → `tasks` → a new project makes the shared tasks database (KAN-536)', () => {
  it('writes the task fields plus `project`, with minted status option ids, filtered to the new option', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([])
    const projectStep = await openBoardTasks()
    fireEvent.click(within(projectStep).getByText('new project — trip planning'))

    let database: ReturnType<typeof sb._pages.get>
    await waitFor(() => {
      database = [...sb._pages.values()].find((p) => p.props._role === TASKS_ROLE)
      expect(database).toBeDefined()
    })
    expect(database!.title).toBe('tasks')

    const schema = readSchema(database!.props)!
    expect(schema.map((field) => [field.name, field.type])).toEqual([
      ['status', 'status'],
      ['done', 'checkbox'],
      ['due', 'date'],
      ['repeats', 'text'],
      ['assignee', 'text'],
      ['project', 'select'],
    ])
    const status = schema[0]
    expect(status.id).toEqual(expect.any(String))
    expect(status.options).toEqual(
      DEFAULT_STATUS_OPTIONS.map((label) => ({ id: expect.any(String), label }))
    )
    // Each status option got its own minted id — not the field's id reused three times.
    const optionIds = status.options!.map((o) => o.id)
    expect(new Set([status.id, ...optionIds]).size).toBe(4)

    // The option the project step picked was written onto the `project` field.
    const project = schema.find((f) => f.name === 'project')!
    expect(project.options).toEqual([{ id: expect.any(String), label: 'trip planning' }])

    // Exactly one role database — the only one this (or any) `/board` may ever make.
    const roleDatabases = [...sb._pages.values()].filter((p) => p.props._role === TASKS_ROLE)
    expect(roleDatabases).toHaveLength(1)

    // The landed block is a board, grouped by status, filtered to the option just written.
    await screen.findByText('tasks · trip planning')
    await screen.findByText('to do')
  })

  it('reuses an existing role database and its options, minting no second one', async () => {
    const statusOptions = DEFAULT_STATUS_OPTIONS.map((label, i) => ({ id: `status-opt-${i}`, label }))
    const existingSchema: PropertySchema = [
      { id: 'status-field', name: 'status', type: 'status', options: statusOptions },
      { id: 'done-field', name: 'done', type: 'checkbox' },
      { id: 'due-field', name: 'due', type: 'date' },
      { id: 'repeats-field', name: 'repeats', type: 'text' },
      { id: 'assignee-field', name: 'assignee', type: 'text' },
      {
        id: 'project-field',
        name: 'project',
        type: 'select',
        options: [{ id: 'project-opt-trip', label: 'trip planning' }],
      },
    ]
    const existingTasksDb: Row = {
      id: 'tasks-db',
      user_id: 'user-1',
      parent_id: 'root-db',
      type: 'page',
      title: 'tasks',
      blocks: [],
      props: { ...withSchema({}, existingSchema), _role: TASKS_ROLE },
      order: 0,
    }
    const sb = makeFakeSupabase([existingTasksDb])
    mockCreateClient.mockReturnValue(sb)
    mockFetchPages.mockResolvedValue([
      {
        id: 'tasks-db',
        parent_id: 'root-db',
        type: 'page',
        title: 'tasks',
        order: 0,
        updated_at: new Date().toISOString(),
        props: existingTasksDb.props,
      } satisfies PageRow,
    ])

    renderCanvas([], { id: 'page-2', title: 'web design' })
    const projectStep = await openBoardTasks()
    // The existing `trip planning` option is offered beside the new row named
    // after THIS page — picking it must reuse the database, not mint another.
    fireEvent.click(within(projectStep).getByText('trip planning'))

    await screen.findByText('tasks · trip planning')
    expect([...sb._pages.values()].filter((p) => p.props._role === TASKS_ROLE)).toHaveLength(1)
    // No write landed at all — the picked option already existed, so neither
    // `addOption` nor `defineSchema` had anything to do.
    expect(sb._inserts).toBe(0)
  })

  it('a `project` field retyped to text gets a select one added back, and the board lands filtered by it', async () => {
    const statusOptions = DEFAULT_STATUS_OPTIONS.map((label, i) => ({ id: `status-opt-${i}`, label }))
    // No usable (select/status) `project` field — only a `text` one of the same
    // name, as if the person had retyped it by hand (KAN-536). `addOption`
    // cannot mint an option onto `text`, so a name-only match here would land
    // the board unfiltered, showing every project.
    const textProjectSchema: PropertySchema = [
      { id: 'status-field', name: 'status', type: 'status', options: statusOptions },
      { id: 'project-text-field', name: 'project', type: 'text' },
    ]
    const existingTasksDb: Row = {
      id: 'tasks-db',
      user_id: 'user-1',
      parent_id: 'root-db',
      type: 'page',
      title: 'tasks',
      blocks: [],
      props: { ...withSchema({}, textProjectSchema), _role: TASKS_ROLE },
      order: 0,
    }
    const sb = makeFakeSupabase([existingTasksDb])
    mockCreateClient.mockReturnValue(sb)
    mockFetchPages.mockResolvedValue([
      {
        id: 'tasks-db',
        parent_id: 'root-db',
        type: 'page',
        title: 'tasks',
        order: 0,
        updated_at: new Date().toISOString(),
        props: existingTasksDb.props,
      } satisfies PageRow,
    ])

    renderCanvas([], { id: 'page-3', title: 'web design' })
    const projectStep = await openBoardTasks()
    // The text field's name match offers no existing option — only the new row.
    fireEvent.click(within(projectStep).getByText('new project — web design'))

    await screen.findByText('tasks · web design')

    const database = sb._pages.get('tasks-db')!
    const schema = readSchema(database.props)!
    const projectFields = schema.filter((f) => f.name === 'project')
    expect(projectFields).toHaveLength(2)
    expect(projectFields.map((f) => f.type).sort()).toEqual(['select', 'text'])
    const selectField = projectFields.find((f) => f.type === 'select')!
    expect(selectField.options).toEqual([{ id: expect.any(String), label: 'web design' }])
  })

  it('two role databases (a restored trash row) never crash the canvas — the project step just opens with no options', async () => {
    // `pickTasksDatabase` throws in development on >1 role row (AGENTS.md
    // "crash early" for an impossible state) — this must be CAUGHT by the
    // `projects` memo, not let through, or every render of this canvas would
    // throw.
    const rows: PageRow[] = [
      {
        id: 'tasks-db-1',
        parent_id: 'root-db',
        type: 'page',
        title: 'tasks',
        order: 0,
        updated_at: new Date(1000).toISOString(),
        created_at: new Date(1000).toISOString(),
        props: { _role: TASKS_ROLE },
      },
      {
        id: 'tasks-db-2',
        parent_id: 'root-db',
        type: 'page',
        title: 'tasks',
        order: 1,
        updated_at: new Date(2000).toISOString(),
        created_at: new Date(2000).toISOString(),
        props: { _role: TASKS_ROLE },
      },
    ]
    mockFetchPages.mockResolvedValue(rows)
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([], { id: 'page-4', title: 'web design' })
    const projectStep = await openBoardTasks()

    expect(within(projectStep).getByText('new project — web design')).toBeInTheDocument()
  })
})
