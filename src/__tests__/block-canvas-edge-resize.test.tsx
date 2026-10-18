/**
 * Dragging a block's edge when it's alone on its line (KAN-441): both edges
 * are mirrored (either one sets the same width, left-aligned), a drag's live
 * preview overrides the block's rendered width with no write, release commits
 * once through `setBlockWidth`'s numeric route (one undo entry restores the
 * old width), and Esc cancels with no write. Hidden during a `⋮⋮` block drag
 * (KAN-440) or with `chrome={false}`; a row-sharing block renders no edge
 * handle in this slice (the shared divider is the split-off child ticket).
 */

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas, type BlockCanvasProps } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

function renderCanvas(
  blocks: Block[],
  onChange: (next: Block[]) => void,
  props: Partial<BlockCanvasProps> = {}
) {
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
          {...props}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const sizingDiv = (blockId: string) => blockRoot(blockId).parentElement as HTMLElement

function edgeHandle(blockId: string, side: 'left' | 'right'): HTMLElement | null {
  return sizingDiv(blockId).querySelector(`[data-testid="block-edge-handle"][data-side="${side}"]`)
}

function readoutText(blockId: string, side: 'left' | 'right'): string | null {
  const handle = edgeHandle(blockId, side)
  return handle?.querySelector('[data-testid="block-edge-handle-readout"]')?.textContent ?? null
}

/** Swaps in a fake ResizeObserver and hands back its captured callback (`block-canvas-rows.test.tsx`'s own helper). */
function mockResizeObserver() {
  const setup = window.ResizeObserver
  let observed: (() => void) | null = null
  window.ResizeObserver = class {
    constructor(callback: () => void) {
      observed = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  return {
    fire: () => act(() => observed?.()),
    restore: () => {
      window.ResizeObserver = setup
    },
  }
}

/** Sets the content column's measured width and fires the ResizeObserver so BlockCanvas re-reads it. */
function setColumnWidth(
  anchorBlockId: string,
  widthPx: number,
  ro: ReturnType<typeof mockResizeObserver>
) {
  const canvas = sizingDiv(anchorBlockId).parentElement as HTMLElement
  jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: widthPx } as DOMRect)
  ro.fire()
}

/** A right-edge drag: `clientX` is the pointer's raw position, so `clientX` itself is the delta off a `0` pointer-down. */
function dragRightEdge(blockId: string, clientX: number) {
  fireEvent.pointerMove(edgeHandle(blockId, 'right')!, { clientX })
}

describe('an alone-on-line edge drag (KAN-441)', () => {
  it('snaps through ¾ → ⅔ → ½, breaks out to a free 46%, and release writes one numeric width with one undo entry', async () => {
    const ro = mockResizeObserver()
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar' }
      const onChange = jest.fn()
      renderCanvas([lone], onChange)
      setColumnWidth('b-lone', 1000, ro)

      expect(edgeHandle('b-lone', 'left')).not.toBeNull()
      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })

      dragRightEdge('b-lone', -250) // 750px = 75%: locks ¾
      expect(readoutText('b-lone', 'right')).toBe('¾')

      dragRightEdge('b-lone', -300) // 700px: breaks the ¾ lock (distance 50px > 16px)
      dragRightEdge('b-lone', -333) // 667px = 66.7%: locks ⅔
      expect(readoutText('b-lone', 'right')).toBe('⅔')

      dragRightEdge('b-lone', -370) // 630px: breaks the ⅔ lock
      dragRightEdge('b-lone', -500) // 500px = 50%: locks ½
      expect(readoutText('b-lone', 'right')).toBe('½')

      // -548.64: the pointer-delta is rendered px (`percentToRenderedPx`'s
      // formula, which includes the row gap), so it isn't simply 1000 * 0.54
      // the way a naive percent*column scaling would read — this value is
      // the one that lands the rendered edge at exactly 46%, breaking the ½
      // lock (46% is no other key's zone).
      dragRightEdge('b-lone', -548.64)
      expect(readoutText('b-lone', 'right')).toBe('46%')

      fireEvent.pointerUp(right, { clientX: -548.64 })

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([{ ...lone, width: 46 }])
      expect(edgeHandle('b-lone', 'right')).not.toBeNull() // the drag ended; the handle itself stays mounted on hover-capable chrome

      const toast = await screen.findByText('Set the block width')
      const undoButton = toast.parentElement!.querySelector('button')!
      fireEvent.click(undoButton)
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenLastCalledWith([lone])
    } finally {
      ro.restore()
    }
  })

  it('release while locked at ½ commits the named width, not a number', async () => {
    const ro = mockResizeObserver()
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar' }
      const onChange = jest.fn()
      renderCanvas([lone], onChange)
      setColumnWidth('b-lone', 1000, ro)

      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      dragRightEdge('b-lone', -500) // 500px = 50%: locks ½
      expect(readoutText('b-lone', 'right')).toBe('½')

      fireEvent.pointerUp(right, { clientX: -500 })

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([{ ...lone, width: '1/2' }])
    } finally {
      ro.restore()
    }
  })

  it('release locked at full commits the named width, not 100', () => {
    const ro = mockResizeObserver()
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar', width: '1/2' }
      const onChange = jest.fn()
      renderCanvas([lone], onChange)
      setColumnWidth('b-lone', 1000, ro)

      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      dragRightEdge('b-lone', 500) // starts at 500px (50%); +500 reaches 1000px = 100%: locks full
      expect(readoutText('b-lone', 'right')).toBe('full')

      fireEvent.pointerUp(right, { clientX: 500 })

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([{ ...lone, width: 'full' }])
    } finally {
      ro.restore()
    }
  })

  it('dragging past the right edge clamps to 100 and still commits the named full, not a number', () => {
    const ro = mockResizeObserver()
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar', width: '1/2' }
      const onChange = jest.fn()
      renderCanvas([lone], onChange)
      setColumnWidth('b-lone', 1000, ro)

      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      dragRightEdge('b-lone', 1_000_000) // far past the column's right edge: clamps to 100%
      expect(readoutText('b-lone', 'right')).toBe('full')

      fireEvent.pointerUp(right, { clientX: 1_000_000 })

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([{ ...lone, width: 'full' }])
    } finally {
      ro.restore()
    }
  })

  it('a pointerdown/pointerup with no movement writes nothing and stages no undo', () => {
    const ro = mockResizeObserver()
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar' }
      const onChange = jest.fn()
      renderCanvas([lone], onChange)
      setColumnWidth('b-lone', 1000, ro)

      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      fireEvent.pointerUp(right, { clientX: 0 })

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.queryByText('Set the block width')).toBeNull()
    } finally {
      ro.restore()
    }
  })

  it('Esc mid-drag restores the pre-drag width and writes nothing', () => {
    const ro = mockResizeObserver()
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar' }
      const onChange = jest.fn()
      renderCanvas([lone], onChange)
      setColumnWidth('b-lone', 1000, ro)

      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      dragRightEdge('b-lone', -250)
      expect(readoutText('b-lone', 'right')).toBe('¾')

      fireEvent.keyDown(document.body, { key: 'Escape' })

      expect(readoutText('b-lone', 'right')).toBeNull()
      expect(sizingDiv('b-lone').style.width).toBe('100%')
      expect(onChange).not.toHaveBeenCalled()

      // The drag is over: a further move does nothing (the ref was cleared).
      dragRightEdge('b-lone', -600)
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      ro.restore()
    }
  })

  it('renders no edge handle during a ⋮⋮ block drag (KAN-440)', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b], () => {})

    expect(edgeHandle('b-a', 'left')).not.toBeNull()
    expect(edgeHandle('b-b', 'left')).not.toBeNull()

    fireEvent.dragStart(blockRoot('b-a'))

    expect(edgeHandle('b-a', 'left')).toBeNull()
    expect(edgeHandle('b-a', 'right')).toBeNull()
    expect(edgeHandle('b-b', 'left')).toBeNull()
    expect(edgeHandle('b-b', 'right')).toBeNull()
  })

  it('renders no edge handle with chrome={false} (zen / read-only)', () => {
    const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar' }
    renderCanvas([lone], () => {}, { chrome: false })

    expect(edgeHandle('b-lone', 'left')).toBeNull()
    expect(edgeHandle('b-lone', 'right')).toBeNull()
  })

  it('dragging far past the clamp releases a block that still renders beside-sized, not 100% wide', () => {
    const ro = mockResizeObserver()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (blocks: Block[], onChange: (next: Block[]) => void) => (
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
    try {
      const lone: Block = { id: 'b-lone', type: 'text', content: 'calendar' }
      const onChange = jest.fn()
      const { rerender } = render(tree([lone], onChange))
      setColumnWidth('b-lone', 1000, ro)

      const right = edgeHandle('b-lone', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      dragRightEdge('b-lone', -1_000_000) // far past the clamp floor
      fireEvent.pointerUp(right, { clientX: -1_000_000 })

      expect(onChange).toHaveBeenCalledTimes(1)
      const [committed] = onChange.mock.calls[0][0]
      expect(committed.width).not.toBe('full')

      // Re-render with the committed width — this is the bug this item fixes:
      // a clamp floor that renders under MIN_BLOCK_WIDTH_PX would make
      // `rowHolds` stack it, and `blockWidthStyle` would then render it 100%
      // wide on release: the opposite of the drag.
      rerender(tree([committed], onChange))
      setColumnWidth('b-lone', 1000, ro)
      expect(sizingDiv('b-lone').style.width).not.toBe('100%')
    } finally {
      ro.restore()
    }
  })

  it('renders no edge handle on blocks that share a row (the divider is a split-off child ticket)', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    renderCanvas([left, right], () => {})

    expect(edgeHandle('b-left', 'left')).toBeNull()
    expect(edgeHandle('b-left', 'right')).toBeNull()
    expect(edgeHandle('b-right', 'left')).toBeNull()
    expect(edgeHandle('b-right', 'right')).toBeNull()
  })
})
