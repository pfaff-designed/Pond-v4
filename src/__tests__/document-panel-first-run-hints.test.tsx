/**
 * KAN-195 — the root-only empty-shell hints (`Pond 06.04` 6d frame 2).
 * `DocumentPanel` mounts `FirstRunHints` instead of the normal page body at
 * the root (`!nodeId`) while the signed-in person's own `first_run_done_at`
 * row reads null, and never once it is set.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'

const mockSearchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

let firstRunDoneAt: string | null = null
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { first_run_done_at: firstRunDoneAt }, error: null }),
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
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

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
})
