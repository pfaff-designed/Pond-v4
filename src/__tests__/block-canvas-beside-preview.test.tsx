/**
 * The live width preview while hovering a beside target (6x). The TARGET
 * row's own members (not the dragged block) still reflow through
 * `previewWidth`, the same state `BlockWidthRow`'s hover preview sets. The
 * dragged block's own planned width shows on its lifted ghost copy instead —
 * its origin (old place) keeps its OLD width throughout a hover, never the
 * preview (`block-canvas-drag-ghost.test.tsx` covers the ghost/origin split
 * itself; this file covers what clears, and on what, when the hover ends).
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
// The sizing div (BlockCanvas.tsx's `style={{ width: sizingWidth }}`) is the
// block root's direct DOM parent — see `block-canvas-drop-line.test.tsx`'s own
// use of `.parentElement` to reach the same ancestor.
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width
const ghostSizingWidth = (blockId: string) =>
  (ghostRoot(blockId)!.parentElement as HTMLElement).style.width

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
  it("shows the equal-share width on the ghost, the origin kept at its OLD width", () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, a beside zone.
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    // Full + full, room < 1/4: equal share for two is 1/2 each — on the ghost.
    expect(ghostSizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    // The origin (old place) never shrinks to the preview — that was the bug.
    expect(sizingWidth('b-a')).toBe('100%')
  })

  it('the ghost unmounts on drag-leave, origin stays at its own kept width', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(ghostRoot('b-a')).not.toBeNull()

    fireEvent.dragLeave(blockRoot('b-b'))
    expect(ghostRoot('b-a')).toBeNull()
    expect(sizingWidth('b-a')).toBe('100%')
  })

  it('the ghost unmounts on drop', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(ghostRoot('b-a')).not.toBeNull()

    fireEvent.drop(blockRoot('b-b'))
    expect(ghostRoot('b-a')).toBeNull()
  })

  it('the ghost unmounts on drag-end', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(ghostRoot('b-a')).not.toBeNull()

    fireEvent.dragEnd(blockRoot('b-a'))
    expect(ghostRoot('b-a')).toBeNull()
  })

  it("previews the TARGET row's own planned width too, not just the ghost's", () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    fireEvent.dragStart(blockRoot('b-a'))
    // Full + full, room < 1/4: equal share for two is 1/2 each — before drop,
    // the target (b-b) should already show its own planned 1/2, not full.
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    expect(ghostSizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    expect(sizingWidth('b-b')).toBe(asInlineStyle(blockWidthStyle('1/2')))
  })

  it('does not preview a beside width (or draw a ghost) over a row that already holds 4', () => {
    const q1: Block = { id: 'b-q1', type: 'text', content: '1', width: '1/4' }
    const q2: Block = { id: 'b-q2', type: 'text', content: '2', width: '1/4' }
    const q3: Block = { id: 'b-q3', type: 'text', content: '3', width: '1/4' }
    const q4: Block = { id: 'b-q4', type: 'text', content: '4', width: '1/4' }
    const fifth: Block = { id: 'b-5', type: 'text', content: '5' }
    renderCanvas([q1, q2, q3, q4, fifth])

    fireEvent.dragStart(blockRoot('b-5'))
    dragOver('b-5', 'b-q1', rect(0, 400), 40, 50)

    expect(sizingWidth('b-5')).toBe('100%')
    expect(ghostRoot('b-5')).toBeNull()
  })
})
