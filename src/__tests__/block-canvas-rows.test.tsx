/**
 * Rows are derived, never stored (6x): `BlockCanvas` groups the block list with
 * `layoutRows` and draws each row that holds more than one block as a single flex
 * row — 16px gap, top-aligned, nothing stretches. Every row, including a lone
 * `full` block, renders the same row+sizing-div shape, so a width change never
 * flips an ancestor's element type (KAN-43 fix: remount-on-reshape).
 */

import React from 'react'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
// Wraps the real `useLayoutEffect` so the last test can confirm BlockCanvas's
// column measurement goes through it, not `useEffect` — must be mocked before
// BlockCanvas's own import, since SWC's CJS interop copies React's exports
// into a fresh object at that import, too early for a later `jest.spyOn` on
// the real module to reach it.
jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react')
  return { ...actual, useLayoutEffect: jest.fn(actual.useLayoutEffect) }
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
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!

describe('rows in BlockCanvas', () => {
  it('shares one row wrapper, 16px gap, for two ½ blocks', () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    renderCanvas([half1, half2])

    const rootA = blockRoot('b-1')
    const rootB = blockRoot('b-2')
    const rowWrapper = rootA.parentElement!.parentElement!
    expect(rowWrapper).toBe(rootB.parentElement!.parentElement)
    expect(rowWrapper.className).toContain('flex')
    expect(rowWrapper.className).toContain('items-start')
    expect(rowWrapper.style.gap).toBe('16px')
    // The board sizes each row child with its own calc() width and does not let
    // it grow past that share, so a wide min-content (a table at ½) must not be
    // able to overflow it.
    expect(rootA.parentElement!.className).toContain('min-w-0')
  })

  it('draws a `full` block after a row in the same stable row+sizing shape, full width', () => {
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    const full: Block = { id: 'b-3', type: 'text', content: 'below' }
    renderCanvas([half1, half2, full])

    const rootC = blockRoot('b-3')
    const sizingDiv = rootC.parentElement!
    const rowDiv = sizingDiv.parentElement!
    expect(sizingDiv.style.width).toBe('100%')
    expect(rowDiv.className).toContain('flex')
    expect(rowDiv.className).toContain('items-start')
    // A solo row carries no gap style — nothing to space.
    expect(rowDiv.style.gap).toBe('')
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

  // The one-stable-shape fix: every row branch (solo full, solo narrow, shared)
  // is now the same row-div + sizing-div pair, so a width change or a stacking
  // flip changes a style attribute, never an ancestor's element type — which is
  // what kept React from remounting the BlockEditor beneath it.
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

    it('crossing the stack threshold on a ½+½ row keeps both BlockEditor nodes', () => {
      const setupObserver = window.ResizeObserver
      let observed: (() => void) | null = null
      window.ResizeObserver = class {
        constructor(callback: () => void) {
          observed = callback
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver

      try {
        const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
        const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
        const { container } = renderCanvas([half1, half2])
        const canvas = container.querySelector('.flex.items-start')!.parentElement as HTMLElement

        // Wide column: the row holds, sharing one line.
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 800,
        } as DOMRect)
        act(() => observed?.())

        const beforeA = blockRoot('b-1')
        const beforeB = blockRoot('b-2')

        // Narrow column: each block's share drops below 240px, so the row stacks.
        jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
          width: 300,
        } as DOMRect)
        act(() => observed?.())

        expect(blockRoot('b-1')).toBe(beforeA)
        expect(blockRoot('b-2')).toBe(beforeB)
      } finally {
        window.ResizeObserver = setupObserver
      }
    })
  })

  // The column measurement must be in place by the first painted frame, or a
  // genuinely narrow window paints the un-stacked row for one frame before it
  // collapses. jsdom has no paint to check that against directly (it never
  // measures — the whole reason `columnWidth` starts at 0), so this pins the
  // one thing that guarantees it: the measurement runs in a layout effect,
  // which React (and the browser) always flush before paint, not a passive
  // `useEffect`, which runs after.
  it('measures the column in a layout effect, not a passive effect', () => {
    const layoutEffectSpy = jest.requireMock<typeof import('react')>('react')
      .useLayoutEffect as jest.Mock
    layoutEffectSpy.mockClear()
    const half1: Block = { id: 'b-1', type: 'text', content: 'left', width: '1/2' }
    const half2: Block = { id: 'b-2', type: 'text', content: 'right', width: '1/2' }
    renderCanvas([half1, half2])
    expect(layoutEffectSpy).toHaveBeenCalled()
  })
})
