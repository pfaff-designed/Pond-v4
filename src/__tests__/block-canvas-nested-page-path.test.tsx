/**
 * `/ nested page` (KAN-122): `makePage`'s `child` placement swaps the `/` line
 * for a page-link block at the same index, stamps the made page nested-under
 * this one, and stays on the parent — never navigating away, unlike `sibling`.
 */

import React, { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { createPage } from '@/lib/pages/client'
import { insertPageOptimistic } from '@/lib/pages/tree'
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
      onUndoRemove={() => {}}
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

describe('`/ nested page` leaves a page-link block where the `/` line was (KAN-122)', () => {
  it('swaps the `/` line for a page-link block at the same index, stamps the page nested-under-this-one, and stays on the parent', async () => {
    const user = userEvent.setup()
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const slashLine: Block = { id: 'b-slash', type: 'text', content: '' }
    renderCanvas([note, slashLine])

    const field = await within(document.getElementById('block-b-slash')!).findByRole('textbox', {
      name: 'text block',
    })
    writeInTextBlock(field, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(field, '/nested')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'nested page')!
    await user.click(row)

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1))
    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({
        parentId: 'page-1',
        props: expect.objectContaining({ kind: 'nested page', nestedFrom: 'page-1' }),
      })
    )

    await waitFor(() => {
      const blocks = document.querySelectorAll('[id^="block-"]')
      expect(blocks).toHaveLength(2)
    })
    const ids = [...document.querySelectorAll('[id^="block-"]')].map((el) => el.id)
    expect(ids[0]).toBe('block-b-note')
    expect(document.getElementById('block-b-slash')).not.toBeInTheDocument()
    expect(ids[1]).not.toBe('block-b-slash')

    expect(insertPageOptimistic).toHaveBeenCalledTimes(1)
    expect(insertPageOptimistic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'new-page',
        props: expect.objectContaining({ kind: 'nested page', nestedFrom: 'page-1' }),
      }),
      null
    )
    expect(mockPush).not.toHaveBeenCalled()
  })
})
