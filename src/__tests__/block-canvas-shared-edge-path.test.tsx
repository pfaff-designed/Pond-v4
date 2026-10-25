/**
 * KAN-505 path test, slice A: a ½/½ row's shared edge, dragged on a real
 * `DocumentPanel` beside the real `ShellCommands` (the ⌘Z owner, sharing one
 * `sessionUndo` stack), snaps to ⅔/⅓ as one write, and one ⌘Z restores ½/½ —
 * same harness as `block-canvas-width-undo-path.test.tsx` (KAN-368), same
 * drag mechanics as `block-canvas-edge-resize.test.tsx`'s own shared-edge
 * case.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep } from '@/lib/change-log/undo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: 'pond-1', name: 'Workshop' }, ponds: [], loading: false }),
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

// `session-undo.ts` stays real: this proves the shared-edge release's
// `rememberPending` and ⌘Z's `undo` share one real stack. Only the RPC
// boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

let recordSeq = 0

beforeEach(() => {
  jest.clearAllMocks()
  recordSeq = 0
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  onPlatform('MacIntel')
  sessionUndo.clear()
})

afterEach(() => jest.restoreAllMocks())

function renderPath(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const sizingDiv = (blockId: string) => blockRoot(blockId).parentElement as HTMLElement

function edgeHandle(blockId: string, side: 'left' | 'right' | 'shared'): HTMLElement | null {
  return sizingDiv(blockId).querySelector(`[data-testid="block-edge-handle"][data-side="${side}"]`)
}

function readoutText(blockId: string, side: 'left' | 'right' | 'shared'): string | null {
  return edgeHandle(blockId, side)?.querySelector('[data-testid="block-edge-handle-readout"]')?.textContent ?? null
}

/**
 * Swaps in a fake ResizeObserver and hands back a `fire()` that re-measures
 * every observed target's `getBoundingClientRect()` into real-shaped
 * entries — unlike `block-canvas-edge-resize.test.tsx`'s own no-arg
 * helper, DocumentPanel mounts other ResizeObserver consumers too
 * (`PageTitleRow`'s), which read `entries[0].contentRect` rather than
 * re-measuring the element themselves.
 */
function mockResizeObserver() {
  const setup = window.ResizeObserver
  const instances: Array<{ callback: ResizeObserverCallback; targets: Element[] }> = []
  window.ResizeObserver = class {
    private entry: { callback: ResizeObserverCallback; targets: Element[] }
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, targets: [] }
      instances.push(this.entry)
    }
    observe(target: Element) {
      this.entry.targets.push(target)
    }
    unobserve(target: Element) {
      this.entry.targets = this.entry.targets.filter((t) => t !== target)
    }
    disconnect() {
      this.entry.targets = []
    }
  } as unknown as typeof ResizeObserver
  return {
    fire: () =>
      act(() => {
        for (const instance of instances) {
          const entries = instance.targets.map(
            (target) => ({ target, contentRect: target.getBoundingClientRect() }) as ResizeObserverEntry
          )
          instance.callback(entries, {} as ResizeObserver)
        }
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

/** A shared-edge drag (carried by the boundary's left member): `clientX` is the pointer's raw position off a `0` pointer-down. */
function dragSharedEdge(leftBlockId: string, clientX: number) {
  fireEvent.pointerMove(edgeHandle(leftBlockId, 'shared')!, { clientX })
}

describe('a ½/½ row\'s shared-edge drag snaps to ⅔/⅓ as one write, one ⌘Z step back (KAN-505)', () => {
  it('drags right past the ⅔ lock, releases once, then ⌘Z restores ½/½', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2' }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    // The mock must be in place before BlockCanvas mounts, so its own
    // `new ResizeObserver(read)` call constructs the mocked class, not the
    // real (jsdom) one — swapping it in after mount leaves that instance
    // reading real (zero) rects forever.
    const ro = mockResizeObserver()
    try {
      renderPath([left, right])
      await screen.findByLabelText('Page title')

      setColumnWidth('b-left', 1000, ro)

      // 1016 = columnPx(1000) + the 16px row gap `percentToRenderedPx` folds
      // in — the delta that lands the raw left percent at exactly 67%, inside
      // the 8px lock band past ⅔'s own 667px (same formula as
      // `block-canvas-edge-resize.test.tsx`'s own `PAST_TWO_THIRDS_CLIENT_X`).
      const PAST_TWO_THIRDS_CLIENT_X = 1016 * 0.67 - 16 - (1016 * 0.5 - 16)

      const shared = edgeHandle('b-left', 'shared')!
      fireEvent.pointerDown(shared, { clientX: 0 })
      dragSharedEdge('b-left', PAST_TWO_THIRDS_CLIENT_X)
      expect(readoutText('b-left', 'shared')).toBe('⅔')

      fireEvent.pointerUp(shared, { clientX: PAST_TWO_THIRDS_CLIENT_X })

      await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
      expect(mockSaveBlocks.mock.calls[0][2]).toEqual([
        { ...left, width: '2/3' },
        { ...right, width: '1/3' },
      ])
      await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

      // The release hands focus back to the handle, not an editor, so the
      // shell's own ⌘Z reaches `sessionUndo` directly (no toast of its own).
      const user = userEvent.setup()
      await user.keyboard('{Meta>}z{/Meta}')

      await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
      expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
        pondId: 'pond-1',
        recordIds: ['record-1'],
      })
    } finally {
      ro.restore()
    }
  })
})
