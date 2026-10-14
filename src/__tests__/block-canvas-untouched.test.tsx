/**
 * An untouched page's blank body (6f, KAN-119) draws no "+ Add a block" foot:
 * the one hint line is the only help. `BlockCanvas` takes `untouched` and
 * hides the foot on top of the existing `chrome` check.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock } from './helpers/text-block'

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

function renderCanvas(blocks: Block[], untouched?: boolean) {
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
          untouched={untouched}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('the foot "+ Add a block" on an untouched page (KAN-119)', () => {
  it('renders for an ordinary page', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderCanvas([note])
    expect(await screen.findByRole('button', { name: 'Add a block' })).toBeInTheDocument()
  })

  it('is omitted for one passed `untouched`', async () => {
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine], true)
    expect(screen.queryByRole('button', { name: 'Add a block' })).not.toBeInTheDocument()
  })
})

describe("the hint line draws in the machine surface's mono, scoped to that one block (6f, KAN-119)", () => {
  it('the sole block carries the override class on an untouched page', async () => {
    const emptyLine: Block = {
      id: 'b-empty',
      type: 'text',
      content: '',
      placeholder: 'type, or / for blocks and templates',
    }
    renderCanvas([emptyLine], true)
    const field = await findTextBlock()
    expect(field.closest('[class*="before:font-mono"]')).not.toBeNull()
    expect(field.closest('[class*="before:ml-[6px]"]')).not.toBeNull()
  })

  it('every OTHER block keeps its ordinary serif placeholder untouched', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: '' }
    renderCanvas([note], false)
    const field = await findTextBlock()
    expect(field.closest('[class*="before:font-mono"]')).toBeNull()
    expect(field.className).toContain('font-serif')
  })
})

describe('the `pond` label over a made page\'s moved prose (6a frame 5, KAN-178)', () => {
  it('shows `pond` and the formatted time for a block carrying `pondStampAt`', async () => {
    const note: Block = {
      id: 'b-made',
      type: 'text',
      content: 'The prose moves across word for word.',
      pondStampAt: '2026-09-22T07:12:00',
    }
    renderCanvas([note])
    await findTextBlock()
    expect(screen.getByText('pond')).toBeInTheDocument()
    expect(screen.getByText('07:12')).toBeInTheDocument()
  })

  it('shows neither for a bare-prose block with no `pondStampAt`', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderCanvas([note])
    await findTextBlock()
    expect(screen.queryByText('pond')).not.toBeInTheDocument()
  })
})
