/**
 * KAN-195 — the root-only empty-shell hints (`Pond 06.04` 6d frame 2).
 * `DocumentPanel` mounts `FirstRunHints` instead of the normal page body at
 * the root (`!nodeId`) while the signed-in person's own `first_run_done_at`
 * row reads null, and never once it is set.
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'

const mockSearchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

let firstRunDoneAt: string | null = null
let firstRunReadError: { message: string } | null = null
// Gates a `single()` read so a test can hold it mid-flight — proving the
// cached value is never read as settled while a refetch is still pending.
let singleReadGate: Promise<void> | null = null
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (singleReadGate) await singleReadGate
            return firstRunReadError
              ? { data: null, error: firstRunReadError }
              : { data: { first_run_done_at: firstRunDoneAt }, error: null }
          },
        }),
      }),
    }),
  }),
}))

jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))
jest.mock('@/lib/pages/home', () => ({
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life' }),
}))
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [], props: {} }),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  firstRunDoneAt = null
  firstRunReadError = null
  singleReadGate = null
  mockSearchParams.delete('nodeId')
})

describe('DocumentPanel — the empty-shell hints', () => {
  it('render at the root while first_run_done_at is null', async () => {
    renderPanel()

    expect(await screen.findByText('What are you thinking about?')).toBeInTheDocument()
    expect(screen.getByText('a project')).toBeInTheDocument()
    expect(screen.queryByLabelText('Page title')).not.toBeInTheDocument()
  })

  it('do not render once first_run_done_at is set', async () => {
    firstRunDoneAt = '2026-10-13T00:00:00.000Z'
    renderPanel()

    expect(await screen.findByLabelText('Page title')).toBeInTheDocument()
    expect(screen.queryByText('What are you thinking about?')).not.toBeInTheDocument()
  })

  it('a read error does not render the hints', async () => {
    firstRunReadError = { message: 'boom' }
    renderPanel()

    expect(await screen.findByLabelText('Page title')).toBeInTheDocument()
    expect(screen.queryByText('What are you thinking about?')).not.toBeInTheDocument()
  })

  it('the flag set while away from the root is read fresh on return', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // A fresh element each render — reusing one JSX object across `rerender`
    // calls lets React bail out of the subtree entirely (same props reference),
    // which would never re-invoke DocumentPanel for the nodeId change below.
    const tree = () => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(tree())

    expect(await screen.findByText('What are you thinking about?')).toBeInTheDocument()

    // made a page elsewhere in the session — the flag flips, but the root's
    // own query is still holding the earlier null read.
    firstRunDoneAt = '2026-10-13T00:00:00.000Z'

    mockSearchParams.set('nodeId', 'page-1')
    rerender(tree())
    expect(await screen.findByLabelText('Page title')).toBeInTheDocument()

    mockSearchParams.delete('nodeId')
    rerender(tree())

    expect(await screen.findByLabelText('Page title')).toBeInTheDocument()
    expect(screen.queryByText('What are you thinking about?')).not.toBeInTheDocument()
  })

  it('a cached null never reads as pending while the confirming refetch is in flight', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(tree())

    expect(await screen.findByText('What are you thinking about?')).toBeInTheDocument()

    // made a page elsewhere — the flag flips, but the next read of it is
    // held open so the test can observe the in-flight window.
    let releaseGate: () => void = () => {}
    singleReadGate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    firstRunDoneAt = '2026-10-13T00:00:00.000Z'

    mockSearchParams.set('nodeId', 'page-1')
    rerender(tree())
    expect(await screen.findByLabelText('Page title')).toBeInTheDocument()

    // re-entering the root fires the refetch — gated, so it never settles here.
    mockSearchParams.delete('nodeId')
    rerender(tree())

    // The refetch's `isFetching` flip lands via a microtask, one tick after
    // the effect calls it — wait for that, then hold here across the whole
    // gated window to prove the hints stay hidden the entire time, not just
    // once settled.
    await waitFor(() => {
      expect(screen.queryByText('What are you thinking about?')).not.toBeInTheDocument()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.queryByText('What are you thinking about?')).not.toBeInTheDocument()

    releaseGate()
    singleReadGate = null

    await waitFor(() => expect(screen.getByLabelText('Page title')).toBeInTheDocument())
    expect(screen.queryByText('What are you thinking about?')).not.toBeInTheDocument()
  })
})
