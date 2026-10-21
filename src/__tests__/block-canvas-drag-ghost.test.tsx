/**
 * A beside drag marks the landing with the drop bar only. The block stays
 * where it is, at the width it already has — no lifted copy, no live reflow.
 * The widths apply on release.
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
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width
const dropBar = (blockId: string) => blockRoot(blockId).querySelector('[data-part="drop-bar"]')

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

// The target's rect is mocked BEFORE `dragstart` fires: dragstart snapshots
// every block's rect (KAN-440), so a mock set afterward is invisible to the
// classification it drives.
function dragOver(sourceId: string, targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  fireEvent.dragStart(blockRoot(sourceId))
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

describe('a beside drag shows a bar and leaves the blocks where they are', () => {
  it('draws the drop bar, dims the held block, and does not clone or resize either block', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
    expect(document.getElementById('block-b-a::ghost')).toBeNull()
    expect(sizingWidth('b-a')).toBe('100%')
    expect(sizingWidth('b-b')).toBe('100%')
    expect(blockRoot('b-a').className).toMatch(/opacity-40/)
    expect(blockRoot('b-a').className).not.toMatch(/shadow-mn-lifted/)

    const floated = document.querySelector<HTMLElement>('[data-part="drag-float"]')
    expect(floated).not.toBeNull()
    expect(blockRoot('b-a').contains(floated)).toBe(false)
    expect(floated!.className).toContain('w-[220px]')
    expect(floated!.className).toContain('max-h-[148px]')
    expect(floated!.className).not.toMatch(/rounded/)
    expect((floated!.firstElementChild as HTMLElement).style.zoom).toBe('0.42')
  })

  it('keeps page order while the bar is showing', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left' }
    const dragged: Block = { id: 'b-dragged', type: 'text', content: 'dragged' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right' }
    renderCanvas([left, dragged, right])

    dragOver('b-dragged', 'b-right', rect(0, 400), 360, 50)

    const ids = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
      el.getAttribute('data-block-id')
    )
    expect(ids).toEqual(['b-left', 'b-dragged', 'b-right'])
    expect(dropBar('b-right')!.getAttribute('data-zone')).toBe('right')
  })
})
