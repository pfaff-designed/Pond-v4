/**
 * Zone classification uses the rect snapshot taken at dragstart (KAN-440),
 * never a live `getBoundingClientRect()` — the live rect moves under the
 * pointer the moment a beside preview resizes the hovered block, which was
 * the flicker this ticket fixes. Re-snapshotting (dragend, and a scroll
 * listener kept only while a drag is live) is what lets the NEXT read of
 * geometry — a second drag, or the same drag after the page scrolls — see
 * real movement instead of the drag's own preview.
 */

import React, { Profiler, type ProfilerOnRenderCallback } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
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
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

// Counts commits of the canvas subtree via `Profiler`, so a hysteresis test can
// assert "no state update fired" directly rather than inferring it from the DOM.
function renderCanvasCountingCommits(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let commits = 0
  const onRender: ProfilerOnRenderCallback = () => {
    commits += 1
  }
  const utils = render(
    <Profiler id="canvas" onRender={onRender}>
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
    </Profiler>
  )
  return { ...utils, getCommits: () => commits }
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const dropBar = (blockId: string) => blockRoot(blockId).querySelector('[data-part="drop-bar"]')

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

// Fires a bare `dragover`, with no rect mocking of its own — the caller sets
// (and later mutates) the target's `getBoundingClientRect` mock itself, so the
// same spy can be read at snapshot time and changed again before this fires.
function fireDragOver(targetId: string, x: number, y: number) {
  const target = blockRoot(targetId)
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

describe('drop-zone classification snapshots block rects at dragstart', () => {
  it('matches the dragstart snapshot, not a live rect mutated mid-drag', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    const target = blockRoot('b-b')
    const rectSpy = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(0, 400))

    // x=40 of this 400-wide rect is 10% across: the outer-left 25%.
    fireEvent.dragStart(blockRoot('b-a'))

    // Shifted 350px left of the snapshot: x=40 is now 97.5% across the LIVE
    // rect — the outer-right 25%. Using the live rect here would flip the
    // zone; using the snapshot keeps it 'left'.
    rectSpy.mockReturnValue(rect(-350, 400))
    fireDragOver('b-b', 40, 50)

    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
  })

  it('a second drag, after the first ends, re-snapshots and sees the new rect', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    const target = blockRoot('b-b')
    const rectSpy = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(0, 400))

    fireEvent.dragStart(blockRoot('b-a'))
    fireDragOver('b-b', 40, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')

    // The block really moved (not a preview) and the drag ends.
    rectSpy.mockReturnValue(rect(-350, 400))
    fireEvent.dragEnd(blockRoot('b-a'))

    // A fresh drag re-snapshots: the same point now classifies against the
    // rect the block actually has now.
    fireEvent.dragStart(blockRoot('b-a'))
    fireDragOver('b-b', 40, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
  })

  it('re-snapshots on scroll while the drag is live', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    const target = blockRoot('b-b')
    const rectSpy = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(0, 400))

    fireEvent.dragStart(blockRoot('b-a'))

    // The page scrolls mid-drag: the block's rect really moves.
    rectSpy.mockReturnValue(rect(-350, 400))
    fireEvent.scroll(window)

    fireDragOver('b-b', 40, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
  })
})

/**
 * Hysteresis (KAN-440): once `{index, zone}` is chosen for a hovered block, it
 * holds while the pointer stays within THAT zone's own sub-rect of the snapshot
 * (left/right split at the rect's horizontal midpoint — 200 for this 400-wide
 * rect), padded 8px on every side. A point that clears the padding reclassifies;
 * one that doesn't fires no state update at all, proven by a `Profiler` commit
 * count rather than inferred from the DOM.
 */
describe('drop-zone classification holds its zone with 8px hysteresis', () => {
  it('jitter within 8px of the left/right boundary keeps the zone and fires no state update', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const { getCommits } = renderCanvasCountingCommits([a, b])

    jest.spyOn(blockRoot('b-b'), 'getBoundingClientRect').mockReturnValue(rect(0, 400))
    fireEvent.dragStart(blockRoot('b-a'))

    // 190/400 = 47.5%: inside the left half, past the 25% edge band, so plain left.
    fireDragOver('b-b', 190, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
    const afterFirstClassification = getCommits()

    // 204 is 4px past the midpoint (200) — inside the left zone's 8px padding.
    fireDragOver('b-b', 204, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
    expect(getCommits()).toBe(afterFirstClassification)
  })

  it('a point more than 8px past the boundary switches the zone, once, each way it crosses', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const { getCommits } = renderCanvasCountingCommits([a, b])

    jest.spyOn(blockRoot('b-b'), 'getBoundingClientRect').mockReturnValue(rect(0, 400))
    fireEvent.dragStart(blockRoot('b-a'))

    fireDragOver('b-b', 190, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
    const afterLeft = getCommits()

    // 212 clears the left zone's padded edge (200 + 8 = 208): the pointer has
    // crossed into the right zone, not jittered within the left one.
    fireDragOver('b-b', 212, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
    expect(getCommits()).toBe(afterLeft + 1)
    const afterRight = getCommits()

    // Moving the same block from its right zone back to its left zone must
    // still change zone — the hysteresis is per zone, not per block: 186
    // clears the right zone's padded edge (200 - 8 = 192) the same way.
    fireDragOver('b-b', 186, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
    expect(getCommits()).toBe(afterRight + 1)
  })

  it('a preview-induced live-rect change never flips the zone, nor fires a state update', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    const { getCommits } = renderCanvasCountingCommits([a, b])

    const rectSpy = jest
      .spyOn(blockRoot('b-b'), 'getBoundingClientRect')
      .mockReturnValue(rect(0, 400))
    fireEvent.dragStart(blockRoot('b-a'))

    fireDragOver('b-b', 190, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
    const afterFirstClassification = getCommits()

    // The beside preview would resize this block's LIVE rect mid-drag — the
    // flicker the earlier snapshot fix already stops reading. The same point,
    // fired again with the live rect shifted under it, must still neither
    // reclassify nor commit.
    rectSpy.mockReturnValue(rect(-350, 400))
    fireDragOver('b-b', 190, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('left')
    expect(getCommits()).toBe(afterFirstClassification)
  })
})

/**
 * `dropIndicator`/`previewWidth` and `stickyZoneRef` are two homes for the
 * same fact — the zone currently shown. `onDragLeave` cleared only the first
 * pair; the next dragover into the SAME zone then read `stickyZoneRef` as
 * still holding it, classified "unchanged", and returned before ever
 * reshowing the indicator the state had just cleared.
 */
describe('leaving the canvas and returning clears the sticky zone along with the indicator', () => {
  it('shows the drop bar again on a dragover into the same zone it just left', () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'a' }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderCanvas([a, b])

    jest.spyOn(blockRoot('b-b'), 'getBoundingClientRect').mockReturnValue(rect(0, 400))
    fireEvent.dragStart(blockRoot('b-a'))

    // x=360 of this 400-wide rect is 90% across: the outer-right 25%, a beside zone.
    fireDragOver('b-b', 360, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')

    // The pointer leaves the canvas entirely — `relatedTarget` outside it,
    // same as dragging off the page and back.
    fireEvent.dragLeave(blockRoot('b-b'), { relatedTarget: document.body })
    expect(dropBar('b-b')).toBeNull()

    // Back over the exact same point. Without clearing `stickyZoneRef` too,
    // this classifies as 'unchanged' against the stale {index, zone} and
    // returns before ever reshowing the indicator.
    fireDragOver('b-b', 360, 50)
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
  })
})
