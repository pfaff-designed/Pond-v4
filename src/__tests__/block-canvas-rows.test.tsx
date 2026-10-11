/**
 * Rows are derived, never stored (6x): `BlockCanvas` groups the block list with
 * `layoutRows` to decide, per row, whether it holds or stacks — but renders no
 * row-level element at all. Every block gets one flat sizing div, keyed
 * `block.id`, inside the one flex-wrap canvas list; a stacked block's sizing
 * div is 100% wide, which (because the list wraps) puts it on its own line.
 * No ancestor key exists for row-regrouping to invalidate, so a block moving
 * between rows can't remount (KAN-43 fix: gut the per-row wrapper).
 */

import React from 'react'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { blockWidthStyle } from '@/lib/modules/layout-rows'

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

/** jsdom's CSSStyleDeclaration reorders a `calc()`, so compare normalized values. */
function normalizedWidth(value: string) {
  const probe = document.createElement('div')
  probe.style.width = value
  return probe.style.width
}

/** Swaps in a fake ResizeObserver and hands back its captured callback. */
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

describe('rows in BlockCanvas', () => {
  it('a ½+½ row at a 300px column gives both sizing divs width 100%, in a wrapping (not column) flex list', () => {
    const ro = mockResizeObserver()
    try {
      const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
      const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
      renderCanvas([half1, half2])

      const canvas = blockRoot('b-1').parentElement!.parentElement! as HTMLElement
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 300 } as DOMRect)
      ro.fire()

      expect(canvas.style.display).toBe('flex')
      expect(canvas.style.flexWrap).toBe('wrap')
      expect(canvas.style.flexDirection).not.toBe('column')
      expect(blockRoot('b-1').parentElement!.style.width).toBe('100%')
      expect(blockRoot('b-2').parentElement!.style.width).toBe('100%')
    } finally {
      ro.restore()
    }
  })

  it('a ½+½ row at a wide column gives each sizing div the calc width', () => {
    const ro = mockResizeObserver()
    try {
      const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
      const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
      renderCanvas([half1, half2])

      const canvas = blockRoot('b-1').parentElement!.parentElement! as HTMLElement
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 800 } as DOMRect)
      ro.fire()

      expect(normalizedWidth(blockRoot('b-1').parentElement!.style.width)).toBe(
        normalizedWidth(blockWidthStyle('1/2'))
      )
      expect(normalizedWidth(blockRoot('b-2').parentElement!.style.width)).toBe(
        normalizedWidth(blockWidthStyle('1/2'))
      )
    } finally {
      ro.restore()
    }
  })

  it('draws a `full` block after a row as a flat sibling in the canvas, full width', () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    const full: Block = { id: 'b-3', type: 'text', content: 'below' }
    renderCanvas([half1, half2, full])

    const canvas = blockRoot('b-1').parentElement!.parentElement!
    const sizingDivC = blockRoot('b-3').parentElement!
    expect(sizingDivC.parentElement).toBe(canvas)
    expect(sizingDivC.style.width).toBe('100%')
  })

  // Stacking (6x) is measured off the canvas via a ResizeObserver. jsdom never
  // measures (getBoundingClientRect stays 0), so this is a smoke render of the
  // wiring itself — the holds/stacks decision is unit-tested directly on
  // `rowHolds` in layout-rows.test.ts.
  it('mounts and tears down its column ResizeObserver without crashing', () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    const { unmount } = renderCanvas([half1, half2])

    expect(blockRoot('b-1')).toBeTruthy()
    expect(() => unmount()).not.toThrow()
  })

  // The per-row wrapper is gone, so there is no ancestor key for a reshape to
  // invalidate — these pin that a width change, a stacking flip, a sibling's
  // removal and a cross-row move each only ever change a style attribute on an
  // existing node, never remount the BlockEditor beneath it.
  describe('keeps the same BlockEditor node across a reshape', () => {
    it('picking ½ on a lone full block keeps the same BlockEditor DOM node', () => {
      const lone: Block = { id: 'b-1', type: 'text', content: 'solo' }
      const { rerender } = renderCanvas([lone])
      const before = blockRoot('b-1')

      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <DeletionUndoProvider>
            <BlockCanvas
              blocks={[{ ...lone, width: '1/2' }]}
              pageId="page-1"
              pageTitle="sourdough, 78%"
              onChange={() => {}}
              onUndoRemove={() => {}}
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      expect(blockRoot('b-1')).toBe(before)
    })

    it('crossing the stack threshold on a ½+½ row actually stacks it', () => {
      const ro = mockResizeObserver()
      try {
        const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
        const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
        renderCanvas([half1, half2])
        const canvas = blockRoot('b-1').parentElement!.parentElement! as HTMLElement

        // Wide column: the row holds, sharing one line.
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 800,
        } as DOMRect)
        ro.fire()

        expect(normalizedWidth(blockRoot('b-1').parentElement!.style.width)).toBe(
          normalizedWidth(blockWidthStyle('1/2'))
        )

        // Narrow column: each block's share drops below 240px, so the row stacks.
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 300,
        } as DOMRect)
        ro.fire()

        expect(blockRoot('b-1').parentElement!.style.width).toBe('100%')
        expect(blockRoot('b-2').parentElement!.style.width).toBe('100%')
      } finally {
        ro.restore()
      }
    })

    it('crossing the stack threshold on a ½+½ row keeps both BlockEditor nodes', () => {
      const ro = mockResizeObserver()
      try {
        const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
        const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
        renderCanvas([half1, half2])
        const canvas = blockRoot('b-1').parentElement!.parentElement! as HTMLElement

        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 800,
        } as DOMRect)
        ro.fire()

        const beforeA = blockRoot('b-1')
        const beforeB = blockRoot('b-2')

        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 300,
        } as DOMRect)
        ro.fire()

        expect(blockRoot('b-1')).toBe(beforeA)
        expect(blockRoot('b-2')).toBe(beforeB)
      } finally {
        ro.restore()
      }
    })

    it("deleting the row's first block keeps the second block's DOM node identical", () => {
      const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
      const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
      const { rerender } = renderCanvas([half1, half2])
      const before = blockRoot('b-2')

      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <DeletionUndoProvider>
            <BlockCanvas
              blocks={[half2]}
              pageId="page-1"
              pageTitle="sourdough, 78%"
              onChange={() => {}}
              onUndoRemove={() => {}}
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      expect(blockRoot('b-2')).toBe(before)
    })

    it('⌥↓ moving a block from one row to another keeps that block\'s DOM node identical', () => {
      const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2' }
      const b: Block = { id: 'b-b', type: 'text', content: 'b', width: '1/2' }
      const c: Block = { id: 'b-c', type: 'text', content: 'c', width: '1/2' }
      const d: Block = { id: 'b-d', type: 'text', content: 'd', width: '1/2' }
      const onChange = jest.fn()
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

      const { rerender } = render(
        <QueryClientProvider client={client}>
          <DeletionUndoProvider>
            <BlockCanvas
              blocks={[a, b, c, d]}
              pageId="page-1"
              pageTitle="sourdough, 78%"
              onChange={onChange}
              onUndoRemove={() => {}}
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      // b-b, in blockRows[0] = [a, b], moves down into blockRows[1] = [c, d]'s
      // place (a swap with b-c) — exercising a block regrouping to a new row.
      const beforeB = blockRoot('b-b')
      act(() => {
        beforeB.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })
        )
      })
      const next = onChange.mock.calls.at(-1)![0] as Block[]
      expect(next.map((block) => block.id)).toEqual(['b-a', 'b-c', 'b-b', 'b-d'])

      rerender(
        <QueryClientProvider client={client}>
          <DeletionUndoProvider>
            <BlockCanvas
              blocks={next}
              pageId="page-1"
              pageTitle="sourdough, 78%"
              onChange={onChange}
              onUndoRemove={() => {}}
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      expect(blockRoot('b-b')).toBe(beforeB)
    })
  })
})
