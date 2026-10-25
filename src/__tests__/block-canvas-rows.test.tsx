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
import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { blockWidthStyle } from '@/lib/modules/layout-rows'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
// ⌥↓ (KAN-368) writes directly through `saveBlocks`/`appendOwnEdit`, like
// drag-drop's own `persistBlocksAsOwnEdit` tests — these two are the only
// calls that path makes beyond the mocked supabase client above.
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

beforeEach(() => {
  jest.clearAllMocks()
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
})

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

  // 6x motion: room-making and drop-settling share the one width transition
  // on each block's sizing div (not a drop-only special case) — it fires on
  // every width change, which room-making and settling both are.
  it("each block's sizing div transitions width over the 280ms settle token, with a reduced-motion opt-out", () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    renderCanvas([half1, half2])

    for (const id of ['b-1', 'b-2']) {
      const className = blockRoot(id).parentElement!.className
      expect(className).toContain('transition-[width]')
      expect(className).toContain('duration-[var(--motion-settle)]')
      expect(className).toContain('ease-[var(--ease-mn)]')
      expect(className).toContain('motion-reduce:transition-none')
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
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      expect(blockRoot('b-2')).toBe(before)
    })

    it('⌥↓ moving a block from one row to another keeps that block\'s DOM node identical', async () => {
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
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      // b-b, in blockRows[0] = [a, b], leaves that row onto its own full-width
      // line directly below it (KAN-376), landing between b-a and blockRows[1]
      // = [c, d], which stays one row — exercising a block regrouping to a new
      // row. The move writes through `persistBlocksAsOwnEdit` (KAN-368), so
      // `onChange` only fires once that direct write's round trip resolves.
      const beforeB = blockRoot('b-b')
      act(() => {
        beforeB.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })
        )
      })
      await waitFor(() => expect(onChange).toHaveBeenCalled())
      const next = onChange.mock.calls.at(-1)![0] as Block[]
      expect(next.map((block) => block.id)).toEqual(['b-a', 'b-b', 'b-c', 'b-d'])

      rerender(
        <QueryClientProvider client={client}>
          <DeletionUndoProvider>
            <BlockCanvas
              blocks={next}
              pageId="page-1"
              pageTitle="sourdough, 78%"
              onChange={onChange}
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      expect(blockRoot('b-b')).toBe(beforeB)
    })
  })

  // KAN-440: `blockRows` (layoutRows) can split a row even with room left over
  // (a block carrying `rowStart`), but the canvas is one flex-wrap list — CSS
  // packs by width alone, so without an explicit break it repacks a leftover
  // ½ beside the ½ before it, undoing the split `layoutRows` made.
  describe('an explicit break follows every blockRows boundary', () => {
    it('a rowStart boundary gets a break; the non-boundary row-mate after it does not', () => {
      const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2' }
      const b: Block = { id: 'b-b', type: 'text', content: 'b', width: '1/2', rowStart: true }
      const c: Block = { id: 'b-c', type: 'text', content: 'c', width: '1/2' }
      renderCanvas([a, b, c])

      const sizingB = blockRoot('b-b').parentElement!
      const sizingC = blockRoot('b-c').parentElement!

      const breakBeforeB = sizingB.previousElementSibling
      expect(breakBeforeB).not.toBeNull()
      expect(breakBeforeB!.getAttribute('aria-hidden')).toBe('true')

      expect(sizingC.previousElementSibling).toBe(sizingB)
    })

    it('a page with no rowStart only breaks at layoutRows\' own (width) boundaries', () => {
      const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/2' }
      const y: Block = { id: 'b-y', type: 'text', content: 'y', width: '1/2' }
      const z: Block = { id: 'b-z', type: 'text', content: 'z' }
      renderCanvas([x, y, z])

      const sizingY = blockRoot('b-y').parentElement!
      const sizingZ = blockRoot('b-z').parentElement!

      // x+y pack into one row (6+6=12 twelfths): no break between them.
      expect(sizingY.previousElementSibling).toBe(blockRoot('b-x').parentElement)
      // z starts a new row on width alone: a break precedes it.
      const breakBeforeZ = sizingZ.previousElementSibling
      expect(breakBeforeZ).not.toBeNull()
      expect(breakBeforeZ!.getAttribute('aria-hidden')).toBe('true')
    })
  })

  // KAN-440: a flex line's cross size clamps at zero (CSS Flexbox §9.4 step 8),
  // so a `rowGap` on the list would count twice around every forced break (one
  // before its own zero-height line, one after). The list's `rowGap` is 0; the
  // gap is carried as `marginTop` on each row's own sizing divs instead.
  describe('the row gap is carried on the blocks, not the list', () => {
    it("the list's own rowGap is 0; a 3-row page puts the gap only on marginTop, only after the first row", () => {
      const a: Block = { id: 'b-a', type: 'text', content: 'a', rowStart: true }
      const b: Block = { id: 'b-b', type: 'text', content: 'b', rowStart: true }
      const c: Block = { id: 'b-c', type: 'text', content: 'c', rowStart: true }
      renderCanvas([a, b, c])

      const list = blockRoot('b-a').parentElement!.parentElement!
      expect(list.style.rowGap).toBe('0')
      expect(blockRoot('b-a').parentElement!.style.marginTop).toBe('0px')
      expect(blockRoot('b-b').parentElement!.style.marginTop).toBe('16px')
      expect(blockRoot('b-c').parentElement!.style.marginTop).toBe('16px')
    })

    it('a zen host\'s listStyle rowGap 22 gives every later row 22, not 16', () => {
      const a: Block = { id: 'b-a', type: 'text', content: 'a', rowStart: true }
      const b: Block = { id: 'b-b', type: 'text', content: 'b', rowStart: true }
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <DeletionUndoProvider>
            <BlockCanvas
              blocks={[a, b]}
              pageId="page-1"
              pageTitle="sourdough, 78%"
              onChange={() => {}}
              onUndoRemove={() => {}}
              listStyle={{ rowGap: 22 }}
            />
          </DeletionUndoProvider>
        </QueryClientProvider>
      )

      expect(blockRoot('b-a').parentElement!.style.marginTop).toBe('0px')
      expect(blockRoot('b-b').parentElement!.style.marginTop).toBe('22px')
    })

    it('a stacked row other than the very first block also gets the gap as marginTop', () => {
      const ro = mockResizeObserver()
      try {
        const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2' }
        const b: Block = { id: 'b-b', type: 'text', content: 'b', width: '1/2' }
        renderCanvas([a, b])
        const canvas = blockRoot('b-a').parentElement!.parentElement! as HTMLElement
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 300 } as DOMRect)
        ro.fire()

        // Narrow column: the row stacks, so a and b each take their own line —
        // only a (the page's very first block) is spared the marginTop.
        expect(blockRoot('b-a').parentElement!.style.marginTop).toBe('0px')
        expect(blockRoot('b-b').parentElement!.style.marginTop).toBe('16px')
      } finally {
        ro.restore()
      }
    })
  })
})
