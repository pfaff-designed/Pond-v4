/**
 * The dragged block renders TWICE while a beside drop is planned (6x frame 3,
 * `PondBlock.dc.html`'s `lifted`/`origin` states): an inert, `aria-hidden`
 * ghost at the PLANNED slot and width (the lifted copy), and the real block
 * reinserted at its OLD slot, at its OLD width (the origin — opacity-40 only,
 * never the lift classes, never the preview width). `block-canvas-drag-lift
 * .test.tsx` covers the origin's own styling in isolation; this file covers
 * the two-node split and the ghost's own styling.
 */

import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
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
const ghostRoot = (blockId: string) => document.getElementById(`block-${blockId}::ghost`)
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width
const ghostSizingWidth = (blockId: string) =>
  (ghostRoot(blockId)!.parentElement as HTMLElement).style.width

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

function asInlineStyle(width: string): string {
  const el = document.createElement('div')
  el.style.width = width
  return el.style.width
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

/**
 * The actual row grouping a person would see: every `block-*` node (real and
 * ghost) in DOM order, split wherever an explicit row-break sibling (KAN-440)
 * sits right before its sizing div — not re-packed by width, since a row can
 * now split with room left over (`rowStart`), which plain `layoutRows` on
 * width alone can't see. Proves row MEMBERSHIP — which ids land in the same
 * row — not just each id's own width in isolation.
 */
function isRowBreak(el: Element | null): boolean {
  return el?.getAttribute('aria-hidden') === 'true' && el.childElementCount === 0
}

function renderedRows(): string[][] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[id^="block-"]'))
  const rows: string[][] = []
  for (const el of elements) {
    const sizingDiv = el.parentElement as HTMLElement
    if (rows.length === 0 || isRowBreak(sizingDiv.previousElementSibling)) rows.push([])
    rows[rows.length - 1].push(el.id.replace(/^block-/, ''))
  }
  return rows
}

describe('the ghost/origin split during a beside hover', () => {
  it('draws one origin (old width, opacity-40, no lift) and one ghost (planned width, lifted)', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOver('b-a', 'b-b', rect(0, 400), 360, 50)

    // One origin node: the real id, its OLD (full) width, opacity-40 only.
    const origin = blockRoot('b-a')
    expect(sizingWidth('b-a')).toBe('100%')
    expect(origin.className).toMatch(/opacity-40/)
    expect(origin.className).not.toMatch(/shadow-mn-lifted/)
    expect(origin.className).not.toMatch(/rotate-\[-\.6deg\]/)

    // One ghost node: a suffixed id, the planned (1/2) width, lifted styling,
    // out of the accessibility tree and the tab order.
    const ghost = ghostRoot('b-a')!
    expect(ghostSizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    expect(ghost.className).toMatch(/shadow-mn-lifted/)
    expect(ghost.className).toMatch(/rotate-\[-\.6deg\]/)
    expect(ghost.className).toMatch(/translate-x-\[12px\]/)
    expect(ghost.className).toMatch(/translate-y-\[18px\]/)
    expect(ghost.className).toMatch(/z-\[4\]/)
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(ghost.hasAttribute('inert')).toBe(true)

    // The row's other member (the target) already shows its own planned width.
    expect(sizingWidth('b-b')).toBe(asInlineStyle(blockWidthStyle('1/2')))
  })

  it('reinserts the origin relative to its OLD left neighbour once the dragged index shifts', () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left' }
    const dragged: Block = { id: 'b-dragged', type: 'text', content: 'dragged' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right' }
    renderCanvas([left, dragged, right])

    // Beside-right of `right`: the dragged block's planned slot moves past it,
    // but its origin must stay right after `left` — its real old neighbour.
    dragOver('b-dragged', 'b-right', rect(0, 400), 360, 50)

    const ids = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
      el.getAttribute('data-block-id')
    )
    expect(ids).toEqual(['b-left', 'b-dragged', 'b-right'])
    expect(ghostRoot('b-dragged')).not.toBeNull()
  })

  it('drags UP (table onto log-right): the ghost rows with the log, the origin stays off on its own', () => {
    // PATH step 3 / 6x frame 3: text, log, table — drag the table (last block)
    // onto the log's right edge. The table's old right neighbour doesn't
    // exist, so the origin belongs at the very end, never inside the row the
    // log and the ghost just joined.
    const text: Block = { id: 'b-text', type: 'text', content: 'text' }
    const log: Block = { id: 'b-log', type: 'text', content: 'log' }
    const table: Block = { id: 'b-table', type: 'text', content: 'table' }
    renderCanvas([text, log, table])

    dragOver('b-table', 'b-log', rect(0, 400), 360, 50)

    expect(renderedRows()).toEqual([['b-text'], ['b-log', 'b-table::ghost'], ['b-table']])
  })

  it('drags DOWN (a block before its target): the origin lands after the whole planned row, not inside it', () => {
    // X, C and D already pack into one row (1/3 each); dragging B — sitting
    // BEFORE that row — beside D widens the row to four quarters. B's old
    // right neighbour (C) is itself the row's first member, so inserting
    // right before C would land origin inside the row, splitting X off from
    // C/D/ghost. The fix pushes origin past the row's last member instead.
    const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/3' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const c: Block = { id: 'b-c', type: 'text', content: 'c', width: '1/3' }
    const d: Block = { id: 'b-d', type: 'text', content: 'd', width: '1/3' }
    renderCanvas([x, b, c, d])

    // Beside-right of `d`.
    dragOver('b-b', 'b-d', rect(0, 400), 360, 50)

    expect(renderedRows()).toEqual([['b-x', 'b-c', 'b-d', 'b-b::ghost'], ['b-b']])
  })

  it('swaps two blocks that already share a row: the planned row stays unbroken however narrow the origin is', () => {
    // D (1/3) and T (1/2) already share one row. Dragging D onto T's own
    // right edge plans D and T beside each other at 1/2 each; `planBesideDrop`
    // marks T `rowStart: true` as the planned row's first member (KAN-440), so
    // the row stays unbroken regardless of what lands before it — the origin
    // can sit at its true old slot, right before its old right neighbour T,
    // without ever merging into T's row.
    const d: Block = { id: 'b-d', type: 'text', content: 'd', width: '1/3' }
    const t: Block = { id: 'b-t', type: 'text', content: 't', width: '1/2' }
    renderCanvas([d, t])

    dragOver('b-d', 'b-t', rect(0, 400), 360, 50)

    expect(renderedRows()).toEqual([['b-d'], ['b-t', 'b-d::ghost']])
  })

  it('the origin carries no rowStart of its own, so it packs beside whatever precedes it instead of forcing an extra line (KAN-440)', () => {
    // A has room (half-width): with the bug, the origin (X's placeholder)
    // forces its OWN line anyway, because it still carries X's stale
    // rowStart, needlessly pushing Y's own already-forced row down by one.
    // The origin is a placeholder, not a row owner — only the row-mate
    // `besidePlan` actually hands `rowStart` to (Y here) should force a break.
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2' }
    const x: Block = { id: 'b-x', type: 'text', content: 'x', width: '1/2', rowStart: true }
    const y: Block = { id: 'b-y', type: 'text', content: 'y', width: '1/2' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, x, y, b])

    dragOver('b-x', 'b-b', rect(0, 400), 360, 50)

    expect(renderedRows()).toEqual([['b-a', 'b-x'], ['b-y'], ['b-b', 'b-x::ghost']])

    // Every row after the first gets exactly one break, no more, no fewer.
    const breakCount = Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
      isRowBreak
    ).length
    expect(breakCount).toBe(renderedRows().length - 1)
  })
})
