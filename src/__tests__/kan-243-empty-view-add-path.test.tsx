/**
 * KAN-243 fix — PATH_STEPS 1 for an EMPTY database (the common case: a table
 * just made from `/` has zero rows), on the REAL `BlockCanvas` host:
 * `viewFrameState` swaps the module for `PondBlockEmpty` the moment a
 * table/list/gallery has zero rows, and `BlockCanvas`'s own empty-state bar
 * used to draw only for a views-shaped block, always with `showAddView={false}`
 * — so "＋ view" was unreachable for a brand-new, still-empty table. Mirrors
 * `kan-352-gantt-empty-block-canvas-path.test.tsx`'s precedent for mocking
 * `useCollectionRows` directly rather than going through the source picker.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

const tableSchema: PropertySchema = [
  { id: 'p-name', name: 'Name', type: 'text' },
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'opt-todo', label: 'todo' },
      { id: 'opt-done', label: 'done' },
    ],
  },
]

const updateSchema = jest.fn()
// Mutated by the "WITH rows" test below (reset in `beforeEach`), since
// `viewFrameState` keys 'empty' off zero rows — a non-empty fixture never
// reaches `BlockCanvas`'s empty-state bar at all, only `ViewControls`'s live one.
let mockRows: CollectionRow[] = []
// `runAddView`'s undo reads "what is current" through `readCachedSchema` (the
// react-query cache), not through this hook's own return — mock it too, or the
// undo's `getLatestSchema()` throws (`readCachedSchema is not a function`) the
// moment a real add actually stages a toast.
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [rows] = useState<CollectionRow[]>(mockRows)
    return {
      schema: tableSchema,
      rows,
      collectionName: 'tasks',
      isLoading: false,
      isError: false,
      setValue: jest.fn(),
      addRow: jest.fn(),
      removeRow: jest.fn(),
      renameRow: jest.fn(),
      updateSchema,
    }
  },
  readCachedSchema: () => tableSchema,
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

// A legacy block — no `views[]` yet, the shape every `/table` insert makes.
const table: Block = { id: 'b-table', type: 'view', mode: 'table' }

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="plans"
      onChange={setBlocks}
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
  mockRows = []
})

describe('BlockCanvas — "＋ view" reaches an empty database too (KAN-243)', () => {
  it('a zero-row legacy table shows "＋ view"; picking "board" selects a board segment', async () => {
    const user = userEvent.setup()
    renderCanvas([table])

    const addViewButton = await screen.findByRole('button', { name: 'add a view' })
    await user.click(addViewButton)

    await user.click(screen.getByRole('option', { name: 'board' }))

    const boardTab = screen.getByRole('tab', { name: 'board' })
    expect(boardTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'add a view' })).toBeInTheDocument()
  })

  it('undoing the OLDER of two staged adds removes only its own view and field, through BlockCanvas\'s two SavedViewBar instances', async () => {
    const user = userEvent.setup()
    renderCanvas([table])

    // First add, off the empty-state bar: calendar has no date field yet, so
    // this mints one. Calendar owns its empty state (block-frame.ts), so the
    // frame flips to 'rest' and the live `ViewControls` bar takes over —
    // a DIFFERENT `SavedViewBar` instance than the one that staged this toast.
    await user.click(await screen.findByRole('button', { name: 'add a view' }))
    await user.click(screen.getByRole('option', { name: /^calendar/ }))
    expect(updateSchema).toHaveBeenCalledTimes(1)
    const schemaAfterCalendar: PropertySchema = updateSchema.mock.calls[0][0]
    expect(schemaAfterCalendar.some((def) => def.type === 'date')).toBe(true)

    // Second add, off the live calendar bar: board already has a status field
    // (tableSchema), so no field is minted for it.
    await user.click(await screen.findByRole('button', { name: 'add a view' }))
    await user.click(screen.getByRole('option', { name: 'board' }))
    expect(updateSchema).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('tab', { name: 'board' })).toHaveAttribute('aria-selected', 'true')

    // Undo the FIRST toast (calendar's) — the second instance's own add (board)
    // must survive, proving the undo read "what is current" off a getter that
    // outlives either bar instance rather than a ref frozen at click time.
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' })
    await user.click(undoButtons[0])

    expect(screen.queryByRole('tab', { name: 'calendar' })).not.toBeInTheDocument()
    const boardTab = screen.getByRole('tab', { name: 'board' })
    expect(boardTab).toHaveAttribute('aria-selected', 'true')
    expect(updateSchema).toHaveBeenCalledTimes(2)
    const schemaAfterUndo: PropertySchema = updateSchema.mock.calls[1][0]
    expect(schemaAfterUndo.some((def) => def.type === 'date')).toBe(false)
    expect(schemaAfterUndo.some((def) => def.type === 'status')).toBe(true)
  })

  it('undoing an add-view toast after editing ANOTHER block leaves that edit alone (KAN-243 fix-3a)', async () => {
    const todo: Block = {
      id: 'b-todo',
      type: 'todo',
      items: [{ id: 'item-1', label: 'sand the top', checked: false }],
    }
    const user = userEvent.setup()
    renderCanvas([table, todo])

    await user.click(await screen.findByRole('button', { name: 'add a view' }))
    await user.click(screen.getByRole('option', { name: 'board' }))
    expect(screen.getByRole('tab', { name: 'board' })).toHaveAttribute('aria-selected', 'true')

    // Edit the OTHER block, through the real canvas — this moves `blocks`
    // past whatever the staged undo's own `onChange` closure saw at add time.
    await user.click(screen.getByRole('checkbox', { name: 'sand the top' }))
    expect(screen.getByRole('checkbox', { name: 'sand the top' })).toHaveAttribute(
      'aria-checked',
      'true'
    )

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.queryByRole('tab', { name: 'board' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'sand the top' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('a legacy table WITH rows: picking "calendar" selects its tab and draws the real grid, through the live ViewControls bar', async () => {
    mockRows = [{ id: 'row-1', title: 'first task', values: {} }]
    const user = userEvent.setup()
    renderCanvas([table])

    await user.click(await screen.findByRole('button', { name: 'add a view' }))
    await user.click(screen.getByRole('option', { name: /^calendar/ }))

    expect(screen.getByRole('tab', { name: 'calendar' })).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelectorAll('[data-part="calendar-day-cell"]').length).toBeGreaterThan(0)
  })
})
