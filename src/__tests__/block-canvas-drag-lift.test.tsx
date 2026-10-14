/**
 * `isDragging` (6x) stands in for both `PondBlock.dc.html` states at once —
 * `origin` (the old place, held at .4 opacity so nothing moves under the
 * pointer) and `lifted` (stepped-up shadow, -.6deg tilt) — since there is no
 * second, custom drag-image element.
 */

import React from 'react'
import { fireEvent, render } from '@testing-library/react'
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

describe('the dragged block: origin opacity + lifted shadow/tilt', () => {
  it('is at rest with neither state before the drag starts', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    expect(blockRoot('b-a').className).not.toContain('opacity-40')
    expect(blockRoot('b-a').className).not.toContain('opacity-50')
    expect(blockRoot('b-a').className).not.toContain('shadow-mn-lifted')
  })

  it('sits at 40% opacity, not 50%, once dragging', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    fireEvent.dragStart(blockRoot('b-a'))

    expect(blockRoot('b-a').className).toContain('opacity-40')
    expect(blockRoot('b-a').className).not.toContain('opacity-50')
  })

  it('also carries the lifted shadow and -.6deg tilt, transitioning over the quick token', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    fireEvent.dragStart(blockRoot('b-a'))

    const className = blockRoot('b-a').className
    expect(className).toContain('shadow-mn-lifted')
    expect(className).toContain('rotate-[-.6deg]')
    expect(className).toContain('duration-[var(--motion-quick)]')
    expect(className).toContain('ease-[var(--ease-mn)]')
  })

  it('clears both states once the drag ends', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    fireEvent.dragStart(blockRoot('b-a'))
    expect(blockRoot('b-a').className).toContain('opacity-40')

    fireEvent.dragEnd(blockRoot('b-a'))
    expect(blockRoot('b-a').className).not.toContain('opacity-40')
    expect(blockRoot('b-a').className).not.toContain('shadow-mn-lifted')
  })
})
