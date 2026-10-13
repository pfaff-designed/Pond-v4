/**
 * On an empty page, `/` leads with templates (6f, KAN-276): `BlockCanvas` reads
 * `blank` off `isBlankBesides(i)` and the glass opens straight on the
 * `templates` group, no head. A page that already has content keeps the
 * ordinary, non-leading list.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const textBlockIn = (blockId: string) =>
  within(blockRoot(blockId)).findByRole('textbox', { name: 'text block' })

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
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

const pageRows = [
  { id: 'root-1', parent_id: null, type: 'page', title: 'recipes', order: 0, updated_at: '' },
  { id: 'page-1', parent_id: 'root-1', type: 'page', title: 'sourdough, 78%', order: 0, updated_at: '' },
]

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          pageTitle="sourdough, 78%"
          onChange={() => {}}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue(pageRows)
})

describe('the `/` menu on an empty page leads with templates (KAN-276)', () => {
  it('opens straight on `templates`, no head, and lists templates before the blocks', async () => {
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])
    writeInTextBlock(await findTextBlock(), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.parentElement!.querySelector('[data-part="head"]')).not.toBeInTheDocument()
    const groups = [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map(
      (g) => g.textContent
    )
    expect(groups[0]).toBe('templates')
  })

  it('a page with existing content renders the ordinary rows, unchanged', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([note, emptyLine])
    writeInTextBlock(await textBlockIn('b-empty'), '/')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.parentElement!.querySelector('[data-part="head"]')).not.toBeInTheDocument()
    const groups = [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map(
      (g) => g.textContent
    )
    expect(groups).toEqual(['text', 'blocks', 'templates', 'pages'])
  })
})
