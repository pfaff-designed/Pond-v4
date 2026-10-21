/**
 * KAN-380 live-verify (data loss): `defineSchema` is a read-modify-write round
 * trip (fetch the page, merge, save) — stacking a delete and a rename fires two
 * overlapping calls, and the slower one's read (taken before the faster one's
 * write landed) can overwrite it with a schema that predates it. Proven here
 * through the REAL `useCollectionRows`/`updateSchema` seam and the REAL
 * `DeletionUndoProvider` (not a mocked `stageUndo`) — `defineSchema` itself is
 * the only thing faked, with its resolution order under the test's control, so
 * the fix (serializing writes in `use-collection-rows.ts`) is proven by the
 * calls never overlapping, not by trusting a synchronous mock.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { ViewView } from '@/lib/modules/view/view'
import type { ViewBlock } from '@/lib/modules/view/schema'
import { SCHEMA_KEY } from '@/lib/properties/schema'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

const FIELD_WHEN = { id: 'f-when', name: 'when', type: 'text' }
const FIELD_FIELD = { id: 'f-field', name: 'field', type: 'text' }

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const mockGetPage = jest.fn()
const mockDefineSchema = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  getCollectionRows: jest.fn().mockResolvedValue([]),
  setProperty: jest.fn(),
  updateTitle: jest.fn(),
  createPage: jest.fn(),
  deletePage: jest.fn(),
  defineSchema: (...args: unknown[]) => mockDefineSchema(...args),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'rec-1' }),
}))

const table: ViewBlock = { id: 'v-table', type: 'view', mode: 'table' }

function renderView() {
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    title: 'Trips',
    props: { [SCHEMA_KEY]: [FIELD_WHEN, FIELD_FIELD] },
    blocks: [],
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
          <ViewView data={table} editable onChange={jest.fn()} />
        </SiblingBlocksProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockGetPage.mockClear()
  mockDefineSchema.mockClear()
})

describe('updateSchema serializes overlapping writes (KAN-380 live-verify)', () => {
  it('never starts a second defineSchema write while an earlier one is still landing', async () => {
    const firstWrite = deferred<void>()
    mockDefineSchema.mockReturnValueOnce(firstWrite.promise)
    const user = userEvent.setup()
    renderView()

    // delete `when` — its defineSchema write is left pending.
    await user.click(await screen.findByRole('button', { name: 'when' }))
    const deleteMenu = await screen.findByRole('menu', { name: 'when field menu' })
    await user.click(within(deleteMenu).getByRole('menuitem', { name: 'delete field' }))
    expect(mockDefineSchema).toHaveBeenCalledTimes(1)

    // rename `field` -> `when`, stacked while the delete's write is still in flight.
    await user.click(screen.getByRole('button', { name: 'field' }))
    const renameMenu = await screen.findByRole('menu', { name: 'field field menu' })
    await user.clear(within(renameMenu).getByLabelText('field name'))
    await user.keyboard('when{Enter}')

    // The rename's write must not have started: it is chained behind the
    // delete's still-pending write, not fired concurrently.
    expect(mockDefineSchema).toHaveBeenCalledTimes(1)

    mockDefineSchema.mockResolvedValueOnce(undefined)
    await act(async () => {
      firstWrite.resolve()
      await firstWrite.promise
    })

    await waitFor(() => expect(mockDefineSchema).toHaveBeenCalledTimes(2))
    expect(mockDefineSchema.mock.calls[1][2]).toEqual([{ ...FIELD_FIELD, name: 'when' }])
  })
})
