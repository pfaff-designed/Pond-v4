/**
 * The lifted ghost sits inside the canvas, over no block's own DOM node (KAN-
 * 247 fix): a block's `dragleave` no longer clears the shown indicator — only
 * another zone being classified, a drop, a dragend, or the drag truly leaving
 * the canvas (checked by `relatedTarget` containment on the canvas root)
 * clears it — and the canvas root itself commits a release that lands on the
 * ghost or the gap between blocks, where no block's `onDrop` is reached at all.
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
  markOutdated: jest.fn().mockResolvedValue(undefined),
}))
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    remember: (...args: unknown[]) => mockRemember(...args),
    trackPending: jest.fn(),
  },
}))

// Each test gets its own page id: the page-write queue (KAN-495) is a
// module-level registry keyed by page id that deliberately outlives a
// `BlockCanvas` unmount, so two `it()`s sharing "page-1" would otherwise
// hand the second one the first's leftover `head()` as `before` — masking
// a real own-edit record behind a before===after no-op.
let testPageIdCounter = 0
let testPageId = 'page-1'

beforeEach(() => {
  jest.clearAllMocks()
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  testPageId = `page-${++testPageIdCounter}`
})

function renderCanvas(blocks: Block[], onChange: (next: Block[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId={testPageId}
          pageTitle="sourdough, 78%"
          onChange={onChange}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const ghostRoot = (blockId: string) => document.getElementById(`block-${blockId}::ghost`)!
// Every block's sizing wrapper shares the same parent: the canvas root itself.
const canvasRoot = (anyBlockId: string) => blockRoot(anyBlockId).parentElement!.parentElement!

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

function dragOver(targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

/**
 * Mocks `blockId`'s rect BEFORE a caller's `fireEvent.dragStart`: dragstart
 * snapshots every block's rect (KAN-440), so a mock set afterward (as `dragOver`
 * does, for the live rect a real drag would re-read) is invisible to the
 * classification that snapshot drives — see `block-canvas-beside-drop.test.tsx`'s
 * own `dragAndDrop` helper, which mocks before dragstart for the same reason.
 */
function mockRect(blockId: string, targetRect: DOMRect) {
  jest.spyOn(blockRoot(blockId), 'getBoundingClientRect').mockReturnValue(targetRect)
}

function dropAt(el: Element, x: number, y: number) {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(el, event)
}

describe('the canvas root keeps and commits the indicator the ghost would otherwise lose', () => {
  it('a dragleave from the target into the ghost keeps the drop line up', () => {
    const log: Block = { id: 'b-log', type: 'text', content: 'log' }
    const table: Block = { id: 'b-table', type: 'text', content: 'table' }
    renderCanvas([log, table], () => {})

    mockRect('b-log', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-table'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right of the log.
    dragOver('b-log', rect(0, 400), 360, 50)
    expect(blockRoot('b-log').querySelector('[data-part="drop-bar"]')).not.toBeNull()

    // The log shrinking to 1/2 moves the ghost under the pointer: its
    // dragleave carries the ghost as `relatedTarget`, still inside the canvas.
    const leave = new MouseEvent('dragleave', { bubbles: true, cancelable: true })
    Object.defineProperty(leave, 'relatedTarget', { value: ghostRoot('b-table') })
    fireEvent(blockRoot('b-log'), leave)

    expect(blockRoot('b-log').querySelector('[data-part="drop-bar"]')).not.toBeNull()
  })

  it('a drop landing on the canvas itself (not a block) commits the shown indicator once', async () => {
    const log: Block = { id: 'b-log', type: 'text', content: 'log' }
    const table: Block = { id: 'b-table', type: 'text', content: 'table' }
    // No `onStructuralWrite` prop is passed (this test renders `BlockCanvas`
    // standalone, not via `DocumentPanel`): `persistBlocksAsOwnEdit` (KAN-495)
    // falls back to a plain `onChange` call, the Storybook/no-queue path —
    // `appendOwnEdit`/`sessionUndo.remember` are no longer called directly
    // from here, so "commits once" is now proven by `onChange`'s call count.
    const onChange = jest.fn()
    renderCanvas([log, table], onChange)

    mockRect('b-log', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-table'))
    dragOver('b-log', rect(0, 400), 360, 50)

    // Released over the canvas root's own node, never a block's.
    dropAt(canvasRoot('b-log'), 360, 50)

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange).toHaveBeenCalledWith([
      { ...log, width: '1/2', rowStart: true },
      { ...table, width: '1/2' },
    ])
  })

  it('does not double-commit when the drop reaches both the target block and the canvas', async () => {
    const log: Block = { id: 'b-log', type: 'text', content: 'log' }
    const table: Block = { id: 'b-table', type: 'text', content: 'table' }
    const onChange = jest.fn()
    renderCanvas([log, table], onChange)

    mockRect('b-log', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-table'))
    dragOver('b-log', rect(0, 400), 360, 50)

    // Released on the block itself — the same event bubbles toward the canvas
    // root too; only the block's own commit should land.
    dropAt(blockRoot('b-log'), 360, 50)

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })
})

describe('a zone that offers no plan clears the previous target\'s indicator', () => {
  it('hovering back over the held block\'s own origin drops nothing', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const onChange = jest.fn()
    renderCanvas([a, b], onChange)

    mockRect('b-b', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-a'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right of b.
    dragOver('b-b', rect(0, 400), 360, 50)
    expect(blockRoot('b-b').querySelector('[data-part="drop-bar"]')).not.toBeNull()

    // Back over a's own origin node: no plan is offered there.
    dragOver('b-a', rect(0, 400), 200, 50)
    expect(blockRoot('b-b').querySelector('[data-part="drop-bar"]')).toBeNull()

    dropAt(canvasRoot('b-b'), 200, 50)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onChange).not.toHaveBeenCalled()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('hovering a row that already holds 4 clears an earlier target\'s indicator', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const c: Block = { id: 'b-c', type: 'text', content: 'c', width: '1/4' }
    const d: Block = { id: 'b-d', type: 'text', content: 'd', width: '1/4' }
    const e: Block = { id: 'b-e', type: 'text', content: 'e', width: '1/4' }
    const f: Block = { id: 'b-f', type: 'text', content: 'f', width: '1/4' }
    const onChange = jest.fn()
    renderCanvas([a, b, c, d, e, f], onChange)

    mockRect('b-b', rect(0, 400))
    mockRect('b-c', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-a'))
    dragOver('b-b', rect(0, 400), 360, 50)
    expect(blockRoot('b-b').querySelector('[data-part="drop-bar"]')).not.toBeNull()

    // c already sits in a full 4-block row: no beside plan exists here.
    dragOver('b-c', rect(0, 400), 360, 50)
    expect(blockRoot('b-b').querySelector('[data-part="drop-bar"]')).toBeNull()
    expect(blockRoot('b-c').querySelector('[data-part="drop-bar"]')).toBeNull()

    dropAt(canvasRoot('b-b'), 360, 50)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onChange).not.toHaveBeenCalled()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })
})
