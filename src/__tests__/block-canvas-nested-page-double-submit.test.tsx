/**
 * AUDIT G9: picking `/ nested page` twice fast on the same `/` line must make
 * one page, not two — `makePage` guards itself per slash-target host, cleared
 * once the in-flight `createPage` settles.
 */

import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { createPage } from '@/lib/pages/client'
import type { Block } from '@/lib/documents/types'
import { writeInTextBlock } from './helpers/text-block'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
  createPage: jest.fn().mockResolvedValue({ id: 'new-page', title: '', type: 'page' }),
}))

function Harness({ initialBlocks }: { initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState(initialBlocks)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="kitchen renovation"
      onChange={setBlocks}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initialBlocks={blocks} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createPage as jest.Mock).mockResolvedValue({ id: 'new-page', title: '', type: 'page' })
})

describe('`/ nested page` double-submit guard (KAN-122, AUDIT G9)', () => {
  it('a second pick on the same `/` line before the first `createPage` resolves is a no-op', async () => {
    const slashLine: Block = { id: 'b-slash', type: 'text', content: '' }
    renderCanvas([slashLine])

    const field = await within(document.getElementById('block-b-slash')!).findByRole('textbox', {
      name: 'text block',
    })
    writeInTextBlock(field, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(field, '/page')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'page')!

    // Both clicks dispatched inside one `act`, so the second lands before the
    // first's `closeSlashMenu` state update flushes — the real double-submit
    // race, not two picks on a row React has already removed.
    act(() => {
      fireEvent.click(row)
      fireEvent.click(row)
    })

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1))
  })
})
