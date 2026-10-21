/**
 * `isDragging` (6x) is the `origin` state from `PondBlock.dc.html` — the old
 * place held at .4 opacity so nothing moves under the pointer. `lifted`
 * (stepped-up shadow, -.6deg tilt) belongs to a separate copy, not this node.
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
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!

describe('the dragged block: origin opacity only, no lift', () => {
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

  it('does not carry the lifted shadow or tilt — those belong to a separate copy', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    fireEvent.dragStart(blockRoot('b-a'))

    const className = blockRoot('b-a').className
    expect(className).toContain('opacity-40')
    expect(className).toContain('duration-[var(--motion-quick)]')
    expect(className).toContain('ease-[var(--ease-mn)]')
    expect(className).not.toContain('shadow-mn-lifted')
    expect(className).not.toContain('rotate-[-.6deg]')
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

  it('suppresses the native drag-image snapshot with an off-screen element', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    renderCanvas([a])

    // jsdom's DragEvent carries no real `dataTransfer.setDragImage` — install
    // a spy on the event itself so the handler's call is observable.
    const setDragImage = jest.fn()
    const event = new Event('dragstart', { bubbles: true, cancelable: true }) as unknown as Event & {
      dataTransfer: { setDragImage: typeof setDragImage }
    }
    Object.defineProperty(event, 'dataTransfer', { value: { setDragImage } })
    fireEvent(blockRoot('b-a'), event)

    expect(setDragImage).toHaveBeenCalledTimes(1)
    const [imageArg] = setDragImage.mock.calls[0]
    expect(imageArg).toBeInstanceOf(HTMLElement)
  })
})
