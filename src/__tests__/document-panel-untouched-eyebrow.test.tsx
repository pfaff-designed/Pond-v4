/**
 * KAN-119, board 6f frame 1: an untouched page's eyebrow reads `new — in
 * {parent}` instead of the usual kind/save-state line, until the person
 * types anything — then it falls back to the normal `saving…`/`saved …` line.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([
    { id: 'parent-1', parentId: null, type: 'page', title: 'recipes', order: 0 },
  ])
})

function renderPage(page: Record<string, unknown>) {
  mockGetPage.mockResolvedValue(page)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const untouchedBlocks: Block[] = [
  { id: 'b1', type: 'text', content: '', placeholder: 'type, or / for blocks and templates' },
]

describe('DocumentPanel — the untouched-page eyebrow', () => {
  it('reads `new — in recipes` for a fresh page under recipes', async () => {
    renderPage({ id: 'page-1', parentId: 'parent-1', title: '', blocks: untouchedBlocks, props: {} })

    expect(await screen.findByText('new — in recipes')).toBeInTheDocument()
  })

  it('falls back to the normal save-state line once the person types', async () => {
    renderPage({ id: 'page-1', parentId: 'parent-1', title: '', blocks: untouchedBlocks, props: {} })
    await screen.findByText('new — in recipes')

    const field = await findTextBlock()
    writeInTextBlock(field, 'h')

    await waitFor(() => expect(screen.getByText('saving…')).toBeInTheDocument())
    expect(screen.queryByText('new — in recipes')).toBeNull()
  })
})
