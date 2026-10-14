/**
 * The dragged block renders TWICE while a beside drop is planned (6x frame 3,
 * `PondBlock.dc.html`'s `lifted`/`origin` states): an inert, `aria-hidden`
 * ghost at the PLANNED slot and width (the lifted copy), and the real block
 * reinserted at its OLD slot, at its OLD width (the origin — opacity-40 only,
 * never the lift classes, never the preview width). `block-canvas-drag-lift
 * .test.tsx` covers the origin's own styling in isolation; this file covers
 * the two-node split and the ghost's own styling.
 */

import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
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
const ghostRoot = (blockId: string) => document.getElementById(`block-${blockId}::ghost`)
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width
const ghostSizingWidth = (blockId: string) =>
  (ghostRoot(blockId)!.parentElement as HTMLElement).style.width

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

function asInlineStyle(width: string): string {
  const el = document.createElement('div')
  el.style.width = width
  return el.style.width
}

function dragOver(targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

describe('the ghost/origin split during a beside hover', () => {
  it('draws one origin (old width, opacity-40, no lift) and one ghost (planned width, lifted)', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOver('b-b', rect(0, 400), 360, 50)

    // One origin node: the real id, its OLD (full) width, opacity-40 only.
    const origin = blockRoot('b-a')
    expect(sizingWidth('b-a')).toBe('100%')
    expect(origin.className).toMatch(/opacity-40/)
    expect(origin.className).not.toMatch(/shadow-mn-lifted/)
    expect(origin.className).not.toMatch(/rotate-\[-\.6deg\]/)

    // One ghost node: a suffixed id, the planned (1/2) width, lifted styling,
    // out of the accessibility tree and the tab order.
    const ghost = ghostRoot('b-a')!
    expect(ghostSizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    expect(ghost.className).toMatch(/shadow-mn-lifted/)
    expect(ghost.className).toMatch(/rotate-\[-\.6deg\]/)
    expect(ghost.className).toMatch(/translate-x-\[12px\]/)
    expect(ghost.className).toMatch(/translate-y-\[18px\]/)
    expect(ghost.className).toMatch(/z-\[4\]/)
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(ghost.hasAttribute('inert')).toBe(true)

    // The row's other member (the target) already shows its own planned width.
    expect(sizingWidth('b-b')).toBe(asInlineStyle(blockWidthStyle('1/2')))
  })

  it('reinserts the origin relative to its OLD left neighbour once the dragged index shifts', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left' }
    const dragged: Block = { id: 'b-dragged', type: 'text', content: 'dragged' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right' }
    renderCanvas([left, dragged, right])

    fireEvent.dragStart(blockRoot('b-dragged'))
    // Beside-right of `right`: the dragged block's planned slot moves past it,
    // but its origin must stay right after `left` — its real old neighbour.
    dragOver('b-right', rect(0, 400), 360, 50)

    const ids = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
      el.getAttribute('data-block-id')
    )
    expect(ids).toEqual(['b-left', 'b-dragged', 'b-right'])
    expect(ghostRoot('b-dragged')).not.toBeNull()
  })
})
