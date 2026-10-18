/**
 * Committing a beside drop (6x): the dragged block splices immediately before
 * or after the target, reading order, and `widthsForDropBeside`'s widths land
 * on every block now in that row — including ones whose width didn't change —
 * in one direct write, logged as one own-edit record and remembered with
 * `sessionUndo` (KAN-247's fix: routed through the same direct-write pattern
 * `applyTemplateInPlaceUnguarded` uses, KAN-124), so a drop is one
 * ⌘Z-undoable own edit.
 */

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { getPageWriteQueue } from '@/lib/pages/page-flush'
import { createPageWriteQueue } from '@/lib/pages/page-write-queue'
import { createPageWriter } from '@/lib/pages/commit'
import { createClient } from '@/lib/supabase/client'
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
const mockMarkOutdated = jest.fn().mockResolvedValue([])
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  markOutdated: (...args: unknown[]) => mockMarkOutdated(...args),
}))
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    remember: (...args: unknown[]) => mockRemember(...args),
    trackPending: jest.fn(),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
})

// `onStructuralWrite` — the caller's ONE structural entry point (KAN-495
// moved its queue construction out of `BlockCanvas` into the caller,
// `use-page-draft.ts`'s `writeStructural`: update local state, THEN enqueue).
// Rebuilt here with the same real queue modules so this test's
// `saveBlocks`/`appendOwnEdit`/`sessionUndo.remember` mocks (one layer
// deeper) still see the drop's commit; `onChange` stands in for the "update
// local state" half, same as `writeStructural`'s own `setBlocks`.
function renderCanvas(blocks: Block[], onChange: (next: Block[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onStructuralWrite = (next: Block[]): Promise<boolean> => {
    onChange(next)
    return getPageWriteQueue('page-1', () =>
      createPageWriteQueue(createPageWriter(createClient(), client, 'page-1', 'pond-1'), {
        title: 'sourdough, 78%',
        blocks,
      })
    )
      .enqueue({ kind: 'structural', after: { title: 'sourdough, 78%', blocks: next } })
      .then(() => true)
      .catch(() => false)
  }
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          pageTitle="sourdough, 78%"
          onChange={onChange}
          onStructuralWrite={onStructuralWrite}
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

describe('committing a beside drop', () => {
  it('drops beside a full block: both become 1/2, in reading order, as one ⌘Z-undoable own edit', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    let result: Block[] | null = null
    renderCanvas([a, b], (next) => {
      result = next
    })

    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragAndDrop('b-a', 'b-b', rect(0, 400), 360, 50)

    const expected = [
      { ...b, width: '1/2', rowStart: true },
      { ...a, width: '1/2' },
    ]
    await waitFor(() => expect(result).toEqual(expected))

    // The drop and its widths are one change, logged once and remembered once.
    expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toEqual(
      expect.objectContaining({ before: [a, b], after: expected })
    )
    expect(mockRemember).toHaveBeenCalledTimes(1)
    expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['record-1'] })
  })

  it('drops beside a row with room: the dropped block takes the room, the existing width stays untouched', async () => {
    const third: Block = { id: 'b-third', type: 'text', content: 'third', width: '1/3' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([dropped, third], (next) => {
      result = next
    })

    // x=360 of a 400-wide rect is 90% across: beside-right of `third`.
    dragAndDrop('b-dropped', 'b-third', rect(0, 400), 360, 50)

    // Room = 12 - 4 = 8 twelfths → widest fit is 2/3.
    await waitFor(() =>
      expect(result).toEqual([
        { ...third, width: '1/3', rowStart: true },
        { ...dropped, width: '2/3' },
      ])
    )
  })

  it('drops into a full 1/2+1/2 row: all three become 1/3 (Jira acceptance)', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const dropped: Block = { id: 'b-dropped', type: 'text', content: 'dropped' }
    let result: Block[] | null = null
    renderCanvas([left, right, dropped], (next) => {
      result = next
    })

    // x=360 of a 400-wide rect is 90% across: beside-right of `right`.
    dragAndDrop('b-dropped', 'b-right', rect(0, 400), 360, 50)

    await waitFor(() =>
      expect(result).toEqual([
        { ...left, width: '1/3', rowStart: true },
        { ...right, width: '1/3' },
        { ...dropped, width: '1/3' },
      ])
    )
  })

  it('undo restores the flag: the own-edit record keeps each block\'s exact pre-drop rowStart (KAN-440)', async () => {
    // A already holds `rowStart` from an earlier drop; C (full, no flag) is
    // dragged beside A's left edge, so C becomes the new row start and A's
    // flag is cleared. `sessionUndo`'s undo step (proved generically in
    // change-log-undo.test.ts / .pglite.test.ts) swaps the page back to this
    // very `before` array — so a `before` that is reference-equal to the
    // pre-drop blocks is what makes that swap restore A's `rowStart: true`
    // and C's absent `rowStart` exactly, with no separate undo path to test.
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2', rowStart: true }
    const b: Block = { id: 'b-b', type: 'text', content: 'b', width: '1/2' }
    const c: Block = { id: 'b-c', type: 'text', content: 'c' }
    const before = [a, b, c]
    let result: Block[] | null = null
    renderCanvas(before, (next) => {
      result = next
    })

    // x=40 of a 400-wide rect is 10% across: the outer-left 25%, beside-left of a.
    dragAndDrop('b-c', 'b-a', rect(0, 400), 40, 50)

    const expected = [
      { ...c, width: '1/3', rowStart: true },
      { ...a, width: '1/3', rowStart: undefined },
      { ...b, width: '1/3' },
    ]
    await waitFor(() => expect(result).toEqual(expected))
    expect(result![1]).not.toHaveProperty('rowStart')

    expect(mockAppendOwnEdit.mock.calls[0][1]).toEqual(
      expect.objectContaining({ before, after: expected })
    )
    // `before` is the exact pre-drop array (same objects, same `rowStart`
    // values) — the undo RPC swaps the page back to this, so a is `rowStart:
    // true` again and c's key is simply gone, byte-identical to before the drop.
    expect(mockAppendOwnEdit.mock.calls[0][1].before).toBe(before)
    expect(mockAppendOwnEdit.mock.calls[0][1].before[0]).toEqual({ ...a, rowStart: true })
  })

  it('splices before the target on a left-beside drop', async () => {
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

    await waitFor(() =>
      expect(result).toEqual([a, { ...c, width: '1/2', rowStart: true }, { ...b, width: '1/2' }])
    )
  })
})
