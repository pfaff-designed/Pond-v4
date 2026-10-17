/**
 * KAN-352 fix — a fresh timeline (zero rows, a start+due schema) on the REAL
 * `BlockCanvas` host, not `ViewView` alone: `viewFrameState` used to hand the
 * frame's own void box, which replaced the view outright, so `CollectionGantt`'s
 * own void branch — and its foot "add a task" row — never mounted. Mirrors
 * `kan-344-path.test.tsx`'s precedent for mocking `useCollectionRows` directly
 * rather than going through the source picker/Supabase (orthogonal here: the
 * picker already lands a dated schema, KAN-351).
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
import { addDays } from '@/lib/modules/view/apply'
import { localDateIso } from '@/lib/modules/view/due'

const ganttSchema: PropertySchema = [
  { id: 'p-start', name: 'Start', type: 'date' },
  { id: 'p-due', name: 'Due', type: 'date' },
]

const addRow = jest.fn()
const renameRow = jest.fn()
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [rows] = useState<CollectionRow[]>([])
    return {
      schema: ganttSchema,
      rows,
      collectionName: 'tasks',
      isLoading: false,
      isError: false,
      setValue: jest.fn(),
      addRow,
      removeRow: jest.fn(),
      renameRow,
      updateSchema: jest.fn(),
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

const gantt: Block = { id: 'b-gantt', type: 'view', mode: 'gantt' }

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="plans"
      onChange={setBlocks}
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
  addRow.mockResolvedValue('r-new')
  jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('BlockCanvas — a fresh timeline steps aside so its own "add a task" mounts (KAN-352)', () => {
  it('a dated, zero-row gantt shows "add a task"; typing a title + ↵ adds today→tomorrow', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderCanvas([gantt])

    const addButton = await screen.findByRole('button', { name: 'add a task' })
    await user.click(addButton)

    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await user.type(input, 'plan')
    await user.keyboard('{Enter}')

    const todayIso = localDateIso(new Date())
    expect(addRow).toHaveBeenCalledWith({
      'p-start': todayIso,
      'p-due': addDays(todayIso, 1),
    })
    expect(renameRow).toHaveBeenCalledWith('r-new', 'plan')
  })
})
