/**
 * The held block's live width preview while hovering a beside target (6x): it
 * reuses `previewWidth` (the same state `BlockWidthRow`'s hover preview sets),
 * so dragging over a beside zone shows the width the block will take before
 * drop, and leaving the zone, dropping or ending the drag clears it.
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
// The sizing div (BlockCanvas.tsx's `style={{ width: sizingWidth }}`) is the
// block root's direct DOM parent — see `block-canvas-drop-line.test.tsx`'s own
// use of `.parentElement` to reach the same ancestor.
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

// jsdom's CSSOM re-serializes a `calc()` expression (term order, spacing) rather
// than keeping `blockWidthStyle`'s own string, so compare against the same
// value round-tripped through an element's `style.width`, not the raw string.
function asInlineStyle(width: string): string {
  const el = document.createElement('div')
  el.style.width = width
  return el.style.width
}

function dragOver(sourceId: string, targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

describe("the held block's live width preview over a beside target", () => {
  it('takes the equal-share width a beside drop would set, before drop', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, a beside zone.
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    // Full + full, room < 1/4: equal share for two is 1/2 each.
    expect(sizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))
  })

  it('clears on drag-leave, back to the block’s own kept width', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(sizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))

    fireEvent.dragLeave(blockRoot('b-b'))
    expect(sizingWidth('b-a')).toBe('100%')
  })

  it('clears on drop', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(sizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))

    fireEvent.drop(blockRoot('b-b'))
    expect(sizingWidth('b-a')).toBe('100%')
  })

  it('clears on drag-end', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(sizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))

    fireEvent.dragEnd(blockRoot('b-a'))
    expect(sizingWidth('b-a')).toBe('100%')
  })

  it('does not preview a beside width over a row that already holds 4', () => {
    const q1: Block = { id: 'b-q1', type: 'text', content: '1', width: '1/4' }
    const q2: Block = { id: 'b-q2', type: 'text', content: '2', width: '1/4' }
    const q3: Block = { id: 'b-q3', type: 'text', content: '3', width: '1/4' }
    const q4: Block = { id: 'b-q4', type: 'text', content: '4', width: '1/4' }
    const fifth: Block = { id: 'b-5', type: 'text', content: '5' }
    renderCanvas([q1, q2, q3, q4, fifth])

    fireEvent.dragStart(blockRoot('b-5'))
    dragOver('b-5', 'b-q1', rect(0, 400), 40, 50)

    expect(sizingWidth('b-5')).toBe('100%')
  })
})
