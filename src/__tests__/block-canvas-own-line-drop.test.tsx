/**
 * Committing an own-line drop (6x): the dragged block splices before or after
 * the TARGET'S ROW as a whole, becomes `full`, and every other block in the
 * row keeps the width it already had — one `onChange` call (Jira acceptance,
 * 6x frame 5).
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

describe('committing an own-line drop', () => {
  it('drops under a 1/2+1/2 row: the dropped block is full, after the row, the row keeps its widths', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([left, right, dropped], (next) => {
      result = next
    })

    // y=90 of a 100-tall rect is the bottom 25%: own-line below `right`.
    dragAndDrop('b-dropped', 'b-right', rect(0, 400, 0, 100), 200, 90)

    expect(result).toEqual([left, right, { ...dropped, width: 'full' }])
  })

  it('drops under the FIRST block of a 1/2+1/2 row: lands after the whole row, not between the two halves', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([left, right, dropped], (next) => {
      result = next
    })

    dragAndDrop('b-dropped', 'b-left', rect(0, 400, 0, 100), 200, 90)

    expect(result).toEqual([left, right, { ...dropped, width: 'full' }])
  })

  it('drops above a lone block: lands before it, full, the target untouched', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    let result: Block[] | null = null
    renderCanvas([a, b], (next) => {
      result = next
    })

    // y=10 of a 100-tall rect is the top 25%: own-line above `a`.
    dragAndDrop('b-b', 'b-a', rect(0, 400, 0, 100), 200, 10)

    expect(result).toEqual([{ ...b, width: 'full' }, a])
  })
})
