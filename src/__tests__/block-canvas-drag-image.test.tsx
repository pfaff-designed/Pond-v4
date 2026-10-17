/**
 * The drag-image node BlockCanvas appends to `<body>` must take no space in
 * normal flow (KAN-366 conductor fix round, Jira comment 10247): in static
 * position it made `document.scrollHeight` 1px taller than the viewport,
 * which moved the whole shell on End/PageDown and offset the composer's
 * closed-tab position by a pixel.
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

describe('the drag-image node appended to body', () => {
  it('is fixed, off-screen and non-interactive — nothing added to document flow', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    const dragImage = Array.from(document.body.children).find(
      (el) =>
        el instanceof HTMLDivElement &&
        el.style.width === '1px' &&
        el.style.height === '1px'
    ) as HTMLDivElement | undefined

    expect(dragImage).toBeDefined()
    expect(dragImage!.style.position).toBe('fixed')
    expect(dragImage!.style.top).toBe('-1px')
    expect(dragImage!.style.left).toBe('-1px')
    expect(dragImage!.style.pointerEvents).toBe('none')
    expect(dragImage!.style.opacity).toBe('0')
  })
})
