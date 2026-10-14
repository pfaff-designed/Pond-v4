/**
 * Committing a beside drop (6x): the dragged block splices immediately before
 * or after the target, reading order, and `widthsForDropBeside`'s widths land
 * on every block now in that row — including ones whose width didn't change —
 * in one `onChange` call.
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

function renderCanvas(blocks: Block[], onChange: (next: Block[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          pageTitle="sourdough, 78%"
          onChange={onChange}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

/**
 * Arms the drag off the source block, then drags over and drops on the target
 * at `(x, y)` within `targetRect`. jsdom's `DragEvent` drops `clientX`/
 * `clientY` from its init dict, so the point is defined directly on a plain
 * `MouseEvent` instead — see `block-canvas-drop-line.test.tsx`'s own `dragOver`.
 */
function dragAndDrop(sourceId: string, targetId: string, targetRect: DOMRect, x: number, y: number) {
  fireEvent.dragStart(blockRoot(sourceId))
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  const over = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(over, 'clientX', { value: x })
  Object.defineProperty(over, 'clientY', { value: y })
  fireEvent(target, over)

  const drop = new MouseEvent('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'clientX', { value: x })
  Object.defineProperty(drop, 'clientY', { value: y })
  fireEvent(target, drop)
}

describe('committing a beside drop', () => {
  it('drops beside a full block: both become 1/2, in reading order', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    let result: Block[] | null = null
    renderCanvas([a, b], (next) => {
      result = next
    })

    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragAndDrop('b-a', 'b-b', rect(0, 400), 360, 50)

    expect(result).toEqual([
      { ...b, width: '1/2' },
      { ...a, width: '1/2' },
    ])
  })

  it('drops beside a row with room: the dropped block takes the room, the existing width stays untouched', () => {
    const third: Block = { id: 'b-third', type: 'text', content: 'third', width: '1/3' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([dropped, third], (next) => {
      result = next
    })

    // x=360 of a 400-wide rect is 90% across: beside-right of `third`.
    dragAndDrop('b-dropped', 'b-third', rect(0, 400), 360, 50)

    // Room = 12 - 4 = 8 twelfths → widest fit is 2/3.
    expect(result).toEqual([
      { ...third, width: '1/3' },
      { ...dropped, width: '2/3' },
    ])
  })

  it('drops into a full 1/2+1/2 row: all three become 1/3 (Jira acceptance)', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([left, right, dropped], (next) => {
      result = next
    })

    // x=360 of a 400-wide rect is 90% across: beside-right of `right`.
    dragAndDrop('b-dropped', 'b-right', rect(0, 400), 360, 50)

    expect(result).toEqual([
      { ...left, width: '1/3' },
      { ...right, width: '1/3' },
      { ...dropped, width: '1/3' },
    ])
  })

  it('splices before the target on a left-beside drop', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const c: Block = { id: 'b-c', type: 'text', content: 'c' }
    let result: Block[] | null = null
    renderCanvas([a, b, c], (next) => {
      result = next
    })

    // Drag the last block (c) to sit left of b: a, c, b.
    // x=40 of a 400-wide rect is 10% across: the outer-left 25%, beside-left.
    dragAndDrop('b-c', 'b-b', rect(0, 400), 40, 50)

    expect(result).toEqual([a, { ...c, width: '1/2' }, { ...b, width: '1/2' }])
  })
})
