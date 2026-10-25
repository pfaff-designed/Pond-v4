/**
 * KAN-441 path test, this slice: PATH_STEPS 1-5, 9, 11, 12 walked on a real
 * `BlockCanvas` host — a calendar view block and a text block below it,
 * chrome on and `chrome={false}`. The drag sequence and its helpers mirror
 * `block-canvas-edge-resize.test.tsx`'s own case; the harness shape mirrors
 * `block-canvas-kan-440-path.test.tsx`'s.
 */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas, type BlockCanvasProps } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
// A view block with no `collectionId` draws its own page's rows
// (`viewCollectionId`'s fallback) — mocked flat so mounting the calendar
// block never fetches.
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: [],
    rows: [],
    collectionName: 'events',
    isLoading: false,
    isError: false,
    setValue: jest.fn(),
    setValueAsStep: jest.fn(),
    addRow: jest.fn(),
    removeRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
    logSchemaEdit: jest.fn(),
  }),
}))

const calendar: Block = { id: 'b-cal', type: 'view', mode: 'calendar' }
const text: Block = { id: 'b-text', type: 'text', content: 'notes', width: '1/2' }

function tree(
  client: QueryClient,
  blocks: Block[],
  onChange: (next: Block[]) => void,
  props: Partial<BlockCanvasProps> = {}
) {
  return (
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          pageTitle="verification scratch"
          onChange={onChange}
          onUndoRemove={() => {}}
          {...props}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function renderCanvas(
  blocks: Block[],
  onChange: (next: Block[]) => void,
  props: Partial<BlockCanvasProps> = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, ...render(tree(client, blocks, onChange, props)) }
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const sizingDiv = (blockId: string) => blockRoot(blockId).parentElement as HTMLElement

function edgeHandle(blockId: string, side: 'left' | 'right' | 'shared'): HTMLElement | null {
  return sizingDiv(blockId).querySelector(`[data-testid="block-edge-handle"][data-side="${side}"]`)
}

function readoutText(blockId: string, side: 'left' | 'right' | 'shared'): string | null {
  return edgeHandle(blockId, side)?.querySelector('[data-testid="block-edge-handle-readout"]')?.textContent ?? null
}

/** Swaps in a fake ResizeObserver and hands back its captured callback (`block-canvas-edge-resize.test.tsx`'s own helper). */
function mockResizeObserver() {
  const setup = window.ResizeObserver
  const observed: Array<() => void> = []
  window.ResizeObserver = class {
    constructor(callback: () => void) {
      observed.push(callback)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  return {
    fire: () =>
      act(() => {
        for (const callback of [...observed]) callback()
      }),
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
  jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    width: widthPx,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: widthPx,
    x: 0,
    y: 0,
    toJSON() {
      return {}
    },
  } as DOMRect)
  ro.fire()
}

/** A right-edge drag: `clientX` is the pointer's raw position, so `clientX` itself is the delta off a `0` pointer-down. */
function dragRightEdge(blockId: string, clientX: number) {
  fireEvent.pointerMove(edgeHandle(blockId, 'right')!, { clientX })
}

// jsdom's CSSOM re-serializes a `calc()` expression rather than keeping
// `blockWidthStyle`'s own string — see `block-canvas-kan-440-path.test.tsx`.
function asInlineStyle(width: string): string {
  const el = document.createElement('div')
  el.style.width = width
  return el.style.width
}

describe('PATH_STEP 2: the calendar block alone on its line carries hover-ready edge strips, nothing drawn at rest', () => {
  it('renders both edges with no readout', () => {
    renderCanvas([calendar, text], () => {})
    const right = edgeHandle('b-cal', 'right')
    expect(right).not.toBeNull()
    expect(edgeHandle('b-cal', 'left')).not.toBeNull()
    const pill = right!.querySelector('[data-testid="block-edge-handle-pill"]')
    expect(pill?.getAttribute('class')).toContain('opacity-0')
    expect(pill?.getAttribute('class')).toContain('group-hover:opacity-20')
    expect(readoutText('b-cal', 'right')).toBeNull()
  })
})

describe('PATH_STEPS 3-5: dragging the calendar edge snaps ¾ → ⅔ → ½, breaks out to 46%, and release commits one width and the rowStart handoff', () => {
  it('persists width:46 on the calendar and rowStart:true on the text block below, surviving a re-render with those same blocks', () => {
    const ro = mockResizeObserver()
    try {
      const onChange = jest.fn()
      const { client, rerender } = renderCanvas([calendar, text], onChange)
      setColumnWidth('b-cal', 1000, ro)

      const right = edgeHandle('b-cal', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })

      dragRightEdge('b-cal', -250) // 750px = 75%: locks ¾
      expect(readoutText('b-cal', 'right')).toBe('¾')

      dragRightEdge('b-cal', -300) // breaks the ¾ lock
      dragRightEdge('b-cal', -333) // 667px = 66.7%: locks ⅔
      expect(readoutText('b-cal', 'right')).toBe('⅔')

      dragRightEdge('b-cal', -370) // breaks the ⅔ lock
      dragRightEdge('b-cal', -500) // 500px = 50%: locks ½
      expect(readoutText('b-cal', 'right')).toBe('½')

      // -548.64: the pointer-delta is rendered px (`percentToRenderedPx`'s
      // formula, which includes the row gap), not a naive percent*column
      // scaling — this value is the one that lands the rendered edge at
      // exactly 46%, breaking the ½ lock.
      dragRightEdge('b-cal', -548.64)
      expect(readoutText('b-cal', 'right')).toBe('46%')

      fireEvent.pointerUp(right, { clientX: -548.64 })

      expect(onChange).toHaveBeenCalledTimes(1)
      const committed = onChange.mock.calls[0][0] as Block[]
      // The text block (width 1/2) didn't fit beside the calendar at full
      // (100 + 50 > 100) but newly fits at 46% (46 + 50 <= 100) — the resize
      // hands it `rowStart` so the row stays as it was (SPEC.md's contract).
      expect(committed).toEqual([
        { ...calendar, width: 46 },
        { ...text, rowStart: true },
      ])

      rerender(tree(client, committed, onChange))
      expect(sizingDiv('b-cal').style.width).toBe(asInlineStyle(blockWidthStyle(46)))
      expect(readoutText('b-cal', 'right')).toBeNull()
      expect(edgeHandle('b-cal', 'right')).not.toBeNull()
    } finally {
      ro.restore()
    }
  })
})

describe('PATH_STEP 9: Esc mid-drag cancels with no write', () => {
  it('restores the pre-drag width and writes nothing', () => {
    const ro = mockResizeObserver()
    try {
      const onChange = jest.fn()
      renderCanvas([calendar, text], onChange)
      setColumnWidth('b-cal', 1000, ro)

      const right = edgeHandle('b-cal', 'right')!
      fireEvent.pointerDown(right, { clientX: 0 })
      dragRightEdge('b-cal', -250)
      expect(readoutText('b-cal', 'right')).toBe('¾')

      fireEvent.keyDown(document.body, { key: 'Escape' })

      expect(readoutText('b-cal', 'right')).toBeNull()
      expect(sizingDiv('b-cal').style.width).toBe('100%')
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      ro.restore()
    }
  })
})

describe('PATH_STEP 11: the width menu shows "custom · N%" for the resized calendar block', () => {
  it('reads the custom note once a free width is set', async () => {
    const resized: Block = { ...calendar, width: 46 }
    renderCanvas([resized, text], () => {})

    fireEvent.contextMenu(blockRoot('b-cal'))

    const menu = await screen.findByRole('menu', { name: /block menu/i })
    expect(within(menu).getByText('custom · 46%')).toBeInTheDocument()
  })
})

describe('PATH_STEP 12: no edge handle during a ⋮⋮ block drag, with chrome={false}; a shared row gets the new strips (KAN-505)', () => {
  it('hides every edge handle during a block drag (KAN-440)', () => {
    renderCanvas([calendar, text], () => {})
    expect(edgeHandle('b-cal', 'right')).not.toBeNull()

    fireEvent.dragStart(blockRoot('b-cal'))

    expect(edgeHandle('b-cal', 'left')).toBeNull()
    expect(edgeHandle('b-cal', 'right')).toBeNull()
    expect(edgeHandle('b-text', 'left')).toBeNull()
    expect(edgeHandle('b-text', 'right')).toBeNull()
  })

  it('renders no edge handle with chrome={false} (zen / read-only)', () => {
    renderCanvas([calendar, text], () => {}, { chrome: false })
    expect(edgeHandle('b-cal', 'left')).toBeNull()
    expect(edgeHandle('b-cal', 'right')).toBeNull()
    expect(edgeHandle('b-text', 'left')).toBeNull()
    expect(edgeHandle('b-text', 'right')).toBeNull()
  })

  it('a shared row mounts one shared strip at the boundary and the row\'s two outer strips', () => {
    const left: Block = { ...calendar, width: '1/2' }
    const sharing: Block = { ...text, width: '1/2' }
    renderCanvas([left, sharing], () => {})
    expect(edgeHandle('b-cal', 'left')).not.toBeNull() // the row's own left edge
    expect(edgeHandle('b-cal', 'shared')).not.toBeNull() // the boundary, carried by the left member
    expect(edgeHandle('b-cal', 'right')).toBeNull() // no separate strip: the shared strip covers it
    expect(edgeHandle('b-text', 'left')).toBeNull() // covered by b-cal's shared strip
    expect(edgeHandle('b-text', 'shared')).toBeNull() // the row's last member has no boundary after it
    expect(edgeHandle('b-text', 'right')).not.toBeNull() // the row's own right edge
  })
})
