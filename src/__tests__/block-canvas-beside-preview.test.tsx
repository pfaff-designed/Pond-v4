/**
 * A beside hover shows the drop bar and nothing else. Widths stay as they
 * are until release; leaving, dropping or ending the drag takes the bar away.
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

describe('a beside hover shows the bar and keeps every width', () => {
  it('leaves both blocks at full width and draws the bar on the target', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
    expect(document.getElementById('block-b-a::ghost')).toBeNull()
    expect(sizingWidth('b-a')).toBe('100%')
    expect(sizingWidth('b-b')).toBe('100%')
  })

  it('clears the bar on drag-leave and keeps the held width', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    expect(dropBar('b-b')).not.toBeNull()

    const leave = new MouseEvent('dragleave', { bubbles: true, cancelable: true })
    Object.defineProperty(leave, 'relatedTarget', { value: document.body })
    fireEvent(blockRoot('b-b'), leave)
    expect(dropBar('b-b')).toBeNull()
    expect(sizingWidth('b-a')).toBe('100%')
  })

  it('clears the bar on drop', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    fireEvent.drop(blockRoot('b-b'))
    expect(dropBar('b-b')).toBeNull()
  })

  it('clears the bar on drag-end', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)
    fireEvent.dragEnd(blockRoot('b-a'))
    expect(dropBar('b-b')).toBeNull()
  })

  it('draws no beside bar over a row that already holds 4', () => {
    const q1: Block = { id: 'b-q1', type: 'text', content: '1', width: '1/4' }
    const q2: Block = { id: 'b-q2', type: 'text', content: '2', width: '1/4' }
    const q3: Block = { id: 'b-q3', type: 'text', content: '3', width: '1/4' }
    const q4: Block = { id: 'b-q4', type: 'text', content: '4', width: '1/4' }
    const fifth: Block = { id: 'b-5', type: 'text', content: '5' }
    renderCanvas([q1, q2, q3, q4, fifth])

    dragOver('b-5', 'b-q1', rect(0, 400), 40, 50)

    expect(sizingWidth('b-5')).toBe('100%')
    expect(dropBar('b-q1')?.getAttribute('data-zone')).not.toBe('left')
    expect(dropBar('b-q1')?.getAttribute('data-zone')).not.toBe('right')
  })
})
