/**
 * The debounced save is the pause the change log groups by, so the panel hands
 * `commitBlocks` what the page held before this pause — the blocks it last
 * saved, or last adopted from someone else's write. That is what keeps an
 * accepted diff or a revert out of the next own-edit record.
 */

import React from 'react'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

let mockNodeId = 'page-1'
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const tableWith = (cell: string): Block =>
  ({
    id: 'b-table',
    type: 'table',
    columns: ['Tool', 'Location'],
    rows: [{ id: 'r1', cells: [cell, 'Wall'] }],
  }) as Block

const LOADED: Block[] = [tableWith('Saw')]

const PAGES: Record<string, { id: string; title: string; blocks: Block[] }> = {
  'page-1': { id: 'page-1', title: 'Workshop', blocks: LOADED },
  'page-2': { id: 'page-2', title: 'Shed', blocks: [{ ...tableWith('Drill'), id: 'b-shed' }] },
}

function mount() {
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => PAGES[id])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = () => (
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  const { rerender } = render(tree())
  return { client, rerender: () => rerender(tree()) }
}

// What the real `commitBlocks` resolves to for an own-edit save (KAN-355):
// `{ remembered }`, never a bare `undefined`.
const committedNow = () => ({ remembered: Promise.resolve() })

const deferred = () => {
  let resolve: () => void = () => {}
  const promise = new Promise<{ remembered: Promise<void> }>((res) => {
    resolve = () => res(committedNow())
  })
  return { promise, resolve }
}

const pause = { timeout: 2000 }

const savedCall = (n: number) => {
  const [, , pageId, blocks, opts] = mockCommitBlocks.mock.calls[n]
  return { pageId, blocks: blocks as Block[], opts }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  mockCommitBlocks.mockResolvedValue(committedNow())
})

describe('DocumentPanel — each save says what it changed', () => {
  it('the first save of a page starts from the blocks it loaded', async () => {
    mount()
    fireEvent.change(await screen.findByDisplayValue('Saw'), { target: { value: 'Mitre saw' } })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(savedCall(0).opts).toMatchObject({ ownEdit: true, before: LOADED })
    expect(savedCall(0).blocks).toEqual([tableWith('Mitre saw')])
  })

  it('the next save starts where the last one ended', async () => {
    mount()
    fireEvent.change(await screen.findByDisplayValue('Saw'), { target: { value: 'Mitre saw' } })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), { timeout: 2000 })

    fireEvent.change(await screen.findByDisplayValue('Mitre saw'), {
      target: { value: 'Mitre saw, 10in' },
    })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(2), { timeout: 2000 })

    expect(savedCall(1).opts).toMatchObject({ before: [tableWith('Mitre saw')] })
    expect(savedCall(1).blocks).toEqual([tableWith('Mitre saw, 10in')])
  })

  it('a write it adopted from elsewhere is not counted in the next own edit', async () => {
    const { client } = mount()
    await screen.findByDisplayValue('Saw')

    // An accepted diff or a revert lands on the page underneath the open editor.
    const accepted = [tableWith('Bandsaw')]
    client.setQueryData(['page', 'page-1'], {
      id: 'page-1',
      title: 'Workshop',
      blocks: accepted,
    })
    fireEvent.change(await screen.findByDisplayValue('Bandsaw'), {
      target: { value: 'Bandsaw, 14in' },
    })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(savedCall(0).opts).toMatchObject({ before: accepted })
  })

  it('a save that failed is not where the next one starts', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockCommitBlocks.mockRejectedValueOnce(new Error('offline'))
    mount()
    fireEvent.change(await screen.findByDisplayValue('Saw'), { target: { value: 'Mitre saw' } })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), pause)
    expect(savedCall(0).opts).toMatchObject({ before: LOADED })

    fireEvent.change(await screen.findByDisplayValue('Mitre saw'), {
      target: { value: 'Mitre saw, 10in' },
    })

    // The halted op is retried first — still starting from the load, since
    // nothing of the failed attempt was ever stored — and only once that
    // retry lands does the new edit get its own record, starting from what
    // the retry actually stored. Neither record's `before` is a value the
    // store never held.
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(3), pause)
    expect(savedCall(1).opts).toMatchObject({ before: LOADED })
    expect(savedCall(1).blocks).toEqual([tableWith('Mitre saw')])
    expect(savedCall(2).opts).toMatchObject({ before: [tableWith('Mitre saw')] })
    expect(savedCall(2).blocks).toEqual([tableWith('Mitre saw, 10in')])
    spy.mockRestore()
  })

  it('keystrokes typed while a save is in flight survive it settling', async () => {
    const firstSave = deferred()
    mockCommitBlocks.mockReturnValueOnce(firstSave.promise)
    mount()
    fireEvent.change(await screen.findByDisplayValue('Saw'), { target: { value: 'Mitre saw' } })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), pause)

    fireEvent.change(screen.getByDisplayValue('Mitre saw'), {
      target: { value: 'Mitre saw, 10in' },
    })
    // The first save settles and the page cache takes what it saved — that is
    // this panel's own write, not one to adopt over what is being typed.
    await act(async () => firstSave.resolve())

    expect(screen.getByDisplayValue('Mitre saw, 10in')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Mitre saw')).toBeNull()
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(2), pause)
    expect(savedCall(1).blocks).toEqual([tableWith('Mitre saw, 10in')])
  })

  it('a save still pending from the page just left starts from that page', async () => {
    const { rerender } = mount()
    fireEvent.change(await screen.findByDisplayValue('Saw'), { target: { value: 'Mitre saw' } })

    mockNodeId = 'page-2'
    rerender()
    await screen.findByDisplayValue('Drill')

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), pause)
    expect(savedCall(0).pageId).toBe('page-1')
    expect(savedCall(0).opts).toMatchObject({ before: LOADED })
  })
})
