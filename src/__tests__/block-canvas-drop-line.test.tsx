/**
 * The drop line while dragging (6x): dragging over a block's outer-25% width
 * draws a beside line 9px off that edge (`PondBlock.dc.html`'s `dropBar`); the
 * top/bottom 25% of its middle width draws an own-line 9px off that edge,
 * spanning the full content column rather than just the hovered block's own
 * width. A full row (4 already in it) offers no beside line, only own-line.
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
const dropBar = (blockId: string) => blockRoot(blockId).querySelector('[data-part="drop-bar"]')

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

/**
 * Arms the drag off the source block, then dragOvers the target at `(x, y)`
 * within `targetRect`. jsdom's `DragEvent` drops `clientX`/`clientY` from its
 * init dict (unlike a real browser's), so the point is defined directly on a
 * plain `MouseEvent` instead — React reads `.clientX` off whatever native
 * event fired, regardless of its constructor. The target's rect is mocked
 * BEFORE `dragstart` fires: dragstart snapshots every block's rect (KAN-440),
 * so a mock set afterward is invisible to the classification it drives.
 */
function dragOver(sourceId: string, targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  fireEvent.dragStart(blockRoot(sourceId))
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

describe('the drop line while dragging', () => {
  it('draws a left beside line, 9px into the gap, in the outer-left 25%', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    // x=40 of a 400-wide rect is 10% across: inside the outer-left 25%.
    dragOver('b-a', 'b-b', rect(0, 400), 40, 50)

    const bar = dropBar('b-b')!
    expect(bar.getAttribute('data-zone')).toBe('left')
    expect(bar.getAttribute('data-left')).toBe('-9')
    expect(bar.getAttribute('data-width')).toBe('2')
    expect(bar.getAttribute('data-top')).toBe('0')
    expect(bar.getAttribute('data-bottom')).toBe('0')
  })

  it('draws a right beside line, 9px into the gap, in the outer-right 25%', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    // x=360 of a 400-wide rect is 90% across: inside the outer-right 25%.
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    const bar = dropBar('b-b')!
    expect(bar.getAttribute('data-zone')).toBe('right')
    expect(bar.getAttribute('data-right')).toBe('-9')
    expect(bar.getAttribute('data-width')).toBe('2')
  })

  it("draws an own-line above the target, spanning the full content column (not the target's own width)", () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    const c: Block = { id: 'b-c', type: 'text', content: 'below' }
    renderCanvas([half1, half2, c])

    const canvas = blockRoot('b-1').parentElement!.parentElement! as HTMLElement
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect(0, 800))

    // x=600 of a [416,800) rect is the middle 50% (416+0.5*384=608 centre);
    // y=10 of a 100-tall rect is the top 25%.
    dragOver('b-c', 'b-2', rect(416, 384, 0, 100), 600, 10)

    const bar = dropBar('b-2')!
    expect(bar.getAttribute('data-zone')).toBe('above')
    expect(bar.getAttribute('data-top')).toBe('-9')
    expect(bar.getAttribute('data-height')).toBe('2')
    // left = column.left(0) - target.left(416); width = column.width(800).
    expect(bar.getAttribute('data-left')).toBe('-416')
    expect(bar.getAttribute('data-width')).toBe('800')
  })

  it('draws an own-line below the target, 9px off its bottom edge', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    jest
      .spyOn(blockRoot('b-a').parentElement!.parentElement! as HTMLElement, 'getBoundingClientRect')
      .mockReturnValue(rect(0, 400))

    dragOver('b-a', 'b-b', rect(0, 400, 0, 100), 200, 90)

    const bar = dropBar('b-b')!
    expect(bar.getAttribute('data-zone')).toBe('below')
    expect(bar.getAttribute('data-bottom')).toBe('-9')
    expect(bar.getAttribute('data-height')).toBe('2')
  })

  it('offers no beside line over a row that already holds 4, but still offers its own-line', () => {
    const q1: Block = { id: 'b-q1', type: 'text', content: '1', width: '1/4' }
    const q2: Block = { id: 'b-q2', type: 'text', content: '2', width: '1/4' }
    const q3: Block = { id: 'b-q3', type: 'text', content: '3', width: '1/4' }
    const q4: Block = { id: 'b-q4', type: 'text', content: '4', width: '1/4' }
    const fifth: Block = { id: 'b-5', type: 'text', content: '5' }
    renderCanvas([q1, q2, q3, q4, fifth])

    dragOver('b-5', 'b-q1', rect(0, 400), 40, 50)
    expect(dropBar('b-q1')).toBeNull()

    dragOver('b-5', 'b-q1', rect(0, 400, 0, 100), 200, 10)
    expect(dropBar('b-q1')!.getAttribute('data-zone')).toBe('above')
  })

  it('offers a beside line into a lone full row, since widthsForDropBeside there is not null', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
  })
})
