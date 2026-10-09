/**
 * The debounced save is the pause the change log groups by, so the panel hands
 * `commitBlocks` what the page held before this pause — the blocks it last
 * saved, or last adopted from someone else's write. That is what keeps an
 * accepted diff or a revert out of the next own-edit record.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
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

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

const tableWith = (cell: string): Block =>
  ({
    id: 'b-table',
    type: 'table',
    columns: ['Tool', 'Location'],
    rows: [{ id: 'r1', cells: [cell, 'Wall'] }],
  }) as Block

const LOADED: Block[] = [tableWith('Saw')]

function mount() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks: LOADED })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return client
}

const savedCall = (n: number) => {
  const [, , pageId, blocks, opts] = mockCommitBlocks.mock.calls[n]
  return { pageId, blocks: blocks as Block[], opts }
}

beforeEach(() => jest.clearAllMocks())

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
    const client = mount()
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
})
