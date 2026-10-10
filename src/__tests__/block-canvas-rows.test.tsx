/**
 * Rows are derived, never stored (6x): `BlockCanvas` groups the block list with
 * `layoutRows` and draws each row that holds more than one block as a single flex
 * row — 16px gap, top-aligned, nothing stretches. A row of one `full` block keeps
 * today's rendering exactly: no extra wrapper.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

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

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!

describe('rows in BlockCanvas', () => {
  it('shares one row wrapper, 16px gap, for two ½ blocks', () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    renderCanvas([half1, half2])

    const rootA = blockRoot('b-1')
    const rootB = blockRoot('b-2')
    const rowWrapper = rootA.parentElement!.parentElement!
    expect(rowWrapper).toBe(rootB.parentElement!.parentElement)
    expect(rowWrapper.className).toContain('flex')
    expect(rowWrapper.className).toContain('items-start')
    expect(rowWrapper.style.gap).toBe('16px')
  })

  it('leaves a `full` block after a row unchanged — no wrapper of its own', () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    const full: Block = { id: 'b-3', type: 'text', content: 'below' }
    const { container } = renderCanvas([half1, half2, full])

    const canvas = container.querySelector('.space-y-0')!
    const rootC = blockRoot('b-3')
    // The handle div ('.group.relative') is the block's own root — no sizing or
    // row wrapper sits between it and the canvas, same as before this item.
    expect(rootC.parentElement).toBe(canvas)
  })
})
