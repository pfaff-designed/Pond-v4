/**
 * KAN-547: dropping at the top of the page places the block first. The first
 * row has no gap above it (0 top margin), so the space above row 0 is covered
 * by no block's own DOM node — a real drag there lands on the canvas root,
 * not any block. The root renders an invisible `drop-band-top` child while a
 * drag is live, so those dragover/drop events bubble to the root's own
 * handlers, which commit the dragged block as row 0. A short first block
 * (whose own-line/beside boundary sits inside the hysteresis margin,
 * `DROP_ZONE_HYSTERESIS_PX`) is covered by the same band and commits the same
 * way; the sticky left/right corner case for a short block is a separate
 * concern owned by KAN-548.
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

let testPageIdCounter = 0
let testPageId = 'page-1'

beforeEach(() => {
  jest.clearAllMocks()
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  testPageId = `page-${++testPageIdCounter}`
})

// Same `onStructuralWrite` rebuild as `block-canvas-own-line-drop.test.tsx`'s
// `renderCanvas`, so a committed drop reaches `mockSaveBlocks` one layer deep,
// not just `onChange`.
function renderCanvas(blocks: Block[], onChange: (next: Block[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onStructuralWrite = (next: Block[]): Promise<boolean> => {
    onChange(next)
    return getPageWriteQueue(testPageId, () =>
      createPageWriteQueue(createPageWriter(createClient(), client, testPageId, 'pond-1'), {
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
          pageId={testPageId}
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
// Every block's sizing wrapper shares the same parent: the canvas root itself
// (`block-canvas-canvas-drop.test.tsx`'s own `canvasRoot` helper).
const canvasRoot = (anyBlockId: string) => blockRoot(anyBlockId).parentElement!.parentElement!

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

function dragOverAt(el: Element, x: number, y: number) {
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(el, event)
}

function dropAt(el: Element, x: number, y: number) {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(el, event)
}

describe('KAN-547: dropping at the top of the page places the block first', () => {
  it('a release on the bare canvas above row 0, inside the drop band, commits as first', async () => {
    const calendar: Block = { id: 'b-cal', type: 'view', mode: 'table' } as Block
    const text: Block = { id: 'b-txt', type: 'text', content: 'text' }
    let result: Block[] | null = null
    renderCanvas([calendar, text], (next) => {
      result = next
    })

    // 743-tall, like a calendar view: dragstart snapshots this rect (KAN-440),
    // so the mock must be set before it fires.
    jest.spyOn(blockRoot('b-cal'), 'getBoundingClientRect').mockReturnValue(rect(0, 400, 0, 743))
    fireEvent.dragStart(blockRoot('b-txt'))

    // The point is 6px above the calendar's snapshot top — no block's own
    // node covers it, so the real drag delivers this to the canvas root, not
    // `b-cal`'s own `onDragOver`.
    const root = canvasRoot('b-cal')
    dragOverAt(root, 200, -6)
    dropAt(root, 200, -6)

    await waitFor(() =>
      expect(mockSaveBlocks.mock.calls[0]?.[2]).toEqual([
        { ...text, width: 'full', rowStart: true },
        calendar,
      ])
    )
  })

  it('the drop band exists only while a drag is live', () => {
    const calendar: Block = { id: 'b-cal', type: 'view', mode: 'table' } as Block
    const text: Block = { id: 'b-txt', type: 'text', content: 'text' }
    const { container } = renderCanvas([calendar, text], () => {})

    expect(container.querySelector('[data-part="drop-band-top"]')).toBeNull()

    fireEvent.dragStart(blockRoot('b-txt'))

    expect(container.querySelector('[data-part="drop-band-top"]')).not.toBeNull()

    fireEvent.dragEnd(blockRoot('b-txt'))

    expect(container.querySelector('[data-part="drop-band-top"]')).toBeNull()
  })

  it('a dragover+drop fired on the band itself commits the drag as first, one undo step', async () => {
    const calendar: Block = { id: 'b-cal', type: 'view', mode: 'table' } as Block
    const text: Block = { id: 'b-txt', type: 'text', content: 'text' }
    const { container } = renderCanvas([calendar, text], () => {})

    jest.spyOn(blockRoot('b-cal'), 'getBoundingClientRect').mockReturnValue(rect(0, 400, 0, 743))
    fireEvent.dragStart(blockRoot('b-txt'))

    const band = container.querySelector('[data-part="drop-band-top"]')!
    dragOverAt(band, 200, -6)
    dropAt(band, 200, -6)

    await waitFor(() =>
      expect(mockSaveBlocks.mock.calls[0]?.[2]).toEqual([
        { ...text, width: 'full', rowStart: true },
        calendar,
      ])
    )
    expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1)
    expect(mockRemember).toHaveBeenCalledTimes(1)
  })

  it('a short first block still lets the band commit a drop as first', async () => {
    const first: Block = { id: 'b-first', type: 'text', content: 'first' }
    const second: Block = { id: 'b-second', type: 'text', content: 'second' }
    const { container } = renderCanvas([first, second], () => {})

    jest.spyOn(blockRoot('b-first'), 'getBoundingClientRect').mockReturnValue(rect(0, 400, 0, 24))
    fireEvent.dragStart(blockRoot('b-second'))

    const band = container.querySelector('[data-part="drop-band-top"]')!
    dragOverAt(band, 200, -6)
    dropAt(band, 200, -6)

    await waitFor(() =>
      expect(mockSaveBlocks.mock.calls[0]?.[2]).toEqual([
        { ...second, width: 'full', rowStart: true },
        first,
      ])
    )
  })

  it('dragging the first block to the band after hovering a later zone commits nothing', () => {
    const first: Block = { id: 'b-first', type: 'text', content: 'first' }
    const second: Block = { id: 'b-second', type: 'text', content: 'second' }
    const { container } = renderCanvas([first, second], () => {})

    jest.spyOn(blockRoot('b-second'), 'getBoundingClientRect').mockReturnValue(rect(0, 400, 0, 100))
    fireEvent.dragStart(blockRoot('b-first'))

    // Hovers b-second's own `above` zone (top 25% of its rect) first, which
    // leaves an indicator targeting it.
    dragOverAt(blockRoot('b-second'), 200, 10)

    const band = container.querySelector('[data-part="drop-band-top"]')!
    dragOverAt(band, 200, -6)
    dropAt(band, 200, -6)

    expect(mockSaveBlocks).not.toHaveBeenCalled()
  })
})
