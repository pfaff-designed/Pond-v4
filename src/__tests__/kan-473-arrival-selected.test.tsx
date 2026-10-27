/**
 * KAN-473 — arrival via `useBlockLinkArrival`'s hash draws the same selected
 * state `selectBlockAt` gives, even for a text block (whose row wrapper
 * carries `tabIndex=-1`, `BlockCanvas.tsx:4562`). Both paths call `.focus()`
 * on the exact same element (`document.getElementById(blockDomId(id))`), and
 * the row's own `handleFocus` only checks `e.target === e.currentTarget` —
 * true for a programmatic focus on an unreachable-by-Tab element too, since
 * `tabIndex=-1` only removes it from the Tab order, not from `.focus()`'s
 * own reach. This is a confirmed non-finding, not a fix.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

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
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', parentId: null, blocks: [] }),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  saveBlocks: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))

const first: Block = { id: 'b-first', type: 'text', content: 'first fix' }
const second: Block = { id: 'b-second', type: 'text', content: 'second fix' }

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas blocks={blocks} pageId="page-1" pageTitle="walk" onChange={() => {}} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!

describe('arrival at a text block via the hash selects it (KAN-473)', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('reads the same ring the library draws for an explicit `selectBlockAt` selection (KAN-367)', async () => {
    window.location.hash = '#block-b-second'
    renderCanvas([first, second])

    const secondRoot = blockRoot('b-second')
    await waitFor(() => expect(secondRoot).toHaveFocus())
    const secondProse = secondRoot.querySelector('[data-part="prose"]')!
    // The exact ring `kan-367-path.test.tsx` asserts for an Esc-selected text
    // block — `selectBlockAt`'s own path, since both call `.focus()` on this
    // same row element.
    expect(secondProse).toHaveClass('ring-2', 'ring-mn-text', 'rounded-[20px]')

    // The untouched block draws no ring.
    const firstProse = blockRoot('b-first').querySelector('[data-part="prose"]')!
    expect(firstProse).not.toHaveClass('ring-2')
  })
})
