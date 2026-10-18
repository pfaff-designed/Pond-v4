/**
 * Committing an own-line drop (6x): the dragged block splices before or after
 * the TARGET'S ROW as a whole, becomes `full`, and every other block in the
 * row keeps the width it already had — one direct write, logged as one
 * own-edit record (KAN-247's fix: routed through the same direct-write
 * pattern `applyTemplateInPlaceUnguarded` uses, KAN-124) (Jira acceptance, 6x
 * frame 5).
 */

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(),
  createPage: jest.fn(),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: jest.fn(),
  defineSchema: jest.fn(),
  deletePage: jest.fn(),
}))

const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
})

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
 * The target's rect is mocked BEFORE `dragstart` fires: dragstart snapshots
 * every block's rect (KAN-440), so a mock set afterward is invisible to the
 * classification it drives.
 */
function dragAndDrop(sourceId: string, targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  fireEvent.dragStart(blockRoot(sourceId))
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
  it('drops under a 1/2+1/2 row: the dropped block is full, after the row, the row keeps its widths, logged as one own edit', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([left, right, dropped], (next) => {
      result = next
    })

    // y=90 of a 100-tall rect is the bottom 25%: own-line below `right`.
    dragAndDrop('b-dropped', 'b-right', rect(0, 400, 0, 100), 200, 90)

    const expected = [left, right, { ...dropped, width: 'full', rowStart: true }]
    await waitFor(() => expect(result).toEqual(expected))
    expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toEqual(
      expect.objectContaining({ before: [left, right, dropped], after: expected })
    )
    expect(mockRemember).toHaveBeenCalledTimes(1)
  })

  it('drops under the FIRST block of a 1/2+1/2 row: lands after the whole row, not between the two halves', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([left, right, dropped], (next) => {
      result = next
    })

    dragAndDrop('b-dropped', 'b-left', rect(0, 400, 0, 100), 200, 90)

    await waitFor(() =>
      expect(result).toEqual([left, right, { ...dropped, width: 'full', rowStart: true }])
    )
  })

  it('drops above a lone block: lands before it, full, the target untouched', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    let result: Block[] | null = null
    renderCanvas([a, b], (next) => {
      result = next
    })

    // y=10 of a 100-tall rect is the top 25%: own-line above `a`.
    dragAndDrop('b-b', 'b-a', rect(0, 400, 0, 100), 200, 10)

    await waitFor(() =>
      expect(result).toEqual([{ ...b, width: 'full', rowStart: true }, a])
    )
  })

  it('sets rowStart even when the dragged block already had a width of its own (KAN-440)', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const quarter: Block = { id: 'b-quarter', type: 'text', content: 'quarter', width: '1/4' }
    let result: Block[] | null = null
    renderCanvas([a, quarter], (next) => {
      result = next
    })

    // y=10 of a 100-tall rect is the top 25%: own-line above `a`.
    dragAndDrop('b-quarter', 'b-a', rect(0, 400, 0, 100), 200, 10)

    await waitFor(() =>
      expect(result).toEqual([{ ...quarter, width: 'full', rowStart: true }, a])
    )
  })

  it('dragging a row\'s rowStart holder away onto its own line hands rowStart to the row-mate left behind (KAN-440)', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2', rowStart: true }
    const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/2', rowStart: true }
    const y: Block = { id: 'b-y', type: 'text', content: 'y', width: '1/2' }
    const z: Block = { id: 'b-z', type: 'text', content: 'z' }
    let result: Block[] | null = null
    renderCanvas([a, x, y, z], (next) => {
      result = next
    })

    // y=10 of a 100-tall rect is the top 25%: own-line above `z`.
    dragAndDrop('b-x', 'b-z', rect(0, 400, 0, 100), 200, 10)

    await waitFor(() =>
      expect(result).toEqual([a, { ...y, rowStart: true }, { ...x, width: 'full', rowStart: true }, z])
    )
  })
})
