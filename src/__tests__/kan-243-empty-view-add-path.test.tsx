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
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [rows] = useState<CollectionRow[]>([])
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
})
