/**
 * KAN-440's own path test, walking PATH_STEPS on a real `BlockCanvas`.
 * Harness copied verbatim from `block-menu.test.tsx`.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
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
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

const mockDeletePage = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))

const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
}))

const mockCreateDatabaseFromList = jest.fn().mockResolvedValue({
  view: { id: 'v-1', type: 'view', mode: 'table', collectionId: 'db-1' },
  databaseId: 'db-1',
  databasesRootId: 'root-db',
  rowCount: 4,
  schema: [],
})
jest.mock('@/lib/pages/list-to-table', () => ({
  ...jest.requireActual('@/lib/pages/list-to-table'),
  createDatabaseFromList: (...args: unknown[]) => mockCreateDatabaseFromList(...args),
}))

const block1: Block = { id: 'b-1', type: 'text', content: 'one' }
const block2: Block = { id: 'b-2', type: 'text', content: 'two' }
const block3: Block = { id: 'b-3', type: 'text', content: 'three' }

interface HarnessProps {
  initial: Block[]
  onChange: jest.Mock
}

function Harness({ initial, onChange }: HarnessProps) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="verification scratch"
      onChange={(next) => {
        onChange(next)
        setBlocks(next)
      }}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(initial: Block[]) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const handleOf = (blockId: string) =>
  within(document.getElementById(`block-${blockId}`)!).getByRole('button', {
    name: /drag to move/i,
  })

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const dropBar = (blockId: string) => blockRoot(blockId).querySelector('[data-part="drop-bar"]')
// The sizing div (`style={{ width: sizingWidth }}`) is the block root's direct
// DOM parent — see `block-canvas-beside-preview.test.tsx`'s own use of this.
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

// jsdom's CSSOM re-serializes a `calc()` expression rather than keeping
// `blockWidthStyle`'s own string — see `block-canvas-beside-preview.test.tsx`.
function asInlineStyle(width: string): string {
  const el = document.createElement('div')
  el.style.width = width
  return el.style.width
}

// The target's rect is mocked BEFORE `dragstart` fires: dragstart snapshots
// every block's rect (KAN-440), so a mock set afterward is invisible to the
// classification it drives — see `block-canvas-beside-drop.test.tsx`'s own `dragAndDrop`.
function fireDragOver(targetId: string, x: number, y: number) {
  const target = blockRoot(targetId)
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

function fireDrop(targetId: string, x: number, y: number) {
  const target = blockRoot(targetId)
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('PATH_STEPS 2, 9: pressing the handle opens no menu and moves nothing; right-click opens it', () => {
  it('a bare pointerdown on the handle opens no menu', () => {
    renderCanvas([block1, block2, block3])
    const handle = handleOf('b-1')

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10 })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('a right-click opens the menu, with block 1’s row wrapper untouched', async () => {
    renderCanvas([block1, block2, block3])
    const root = document.getElementById('block-b-1')!
    const rowWrapper = root.parentElement!
    const widthBefore = rowWrapper.style.width
    const classNameBefore = rowWrapper.className

    fireEvent.contextMenu(blockRoot('b-1'))

    expect(await screen.findByRole('menu', { name: /block menu/i })).toBeInTheDocument()
    expect(rowWrapper.style.width).toBe(widthBefore)
    expect(rowWrapper.className).toBe(classNameBefore)
  })
})

describe('PATH_STEPS 3-5: dragging block 1 over block 2 previews, holds still, and drops ½/½', () => {
  it('previews on the first dragover, holds through 5 identical dragovers, reclassifies once moving left, then commits ½/½', async () => {
    renderCanvas([block1, block2, block3])

    const targetRect = rect(0, 400)
    jest.spyOn(blockRoot('b-2'), 'getBoundingClientRect').mockReturnValue(targetRect)

    fireEvent.dragStart(blockRoot('b-1'))

    // x=360 of a 400-wide rect is 90% across: block 2's right zone.
    fireDragOver('b-2', 360, 50)

    // The bar is the preview. Neither block changes width until the drop.
    expect(document.getElementById('block-b-1::ghost')).toBeNull()
    expect(sizingWidth('b-2')).toBe('100%')
    expect(sizingWidth('b-1')).toBe('100%')
    expect(dropBar('b-2')!.getAttribute('data-zone')).toBe('right')

    const widthsAfterPreview = [sizingWidth('b-1'), sizingWidth('b-2'), sizingWidth('b-3')]

    // Five more identical dragovers: the pointer hasn't moved, so nothing
    // about the rendered rows changes — this is the flicker the ticket fixes.
    for (let i = 0; i < 5; i++) {
      fireDragOver('b-2', 360, 50)
    }
    expect([sizingWidth('b-1'), sizingWidth('b-2'), sizingWidth('b-3')]).toEqual(widthsAfterPreview)
    expect(dropBar('b-2')!.getAttribute('data-zone')).toBe('right')

    // Move left in 3 steps across the right→left boundary (midpoint 200,
    // padded ±8px): 260 and 200 both stay inside the right zone's own padded
    // sub-rect, so the zone holds; only 180 clears it and reclassifies.
    fireDragOver('b-2', 260, 50)
    expect(dropBar('b-2')!.getAttribute('data-zone')).toBe('right')

    fireDragOver('b-2', 200, 50)
    expect(dropBar('b-2')!.getAttribute('data-zone')).toBe('right')

    fireDragOver('b-2', 180, 50)
    expect(dropBar('b-2')!.getAttribute('data-zone')).toBe('left')

    fireDrop('b-2', 180, 50)

    await waitFor(() => {
      expect(sizingWidth('b-1')).toBe(asInlineStyle(blockWidthStyle('1/2')))
      expect(sizingWidth('b-2')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    })
  })
})

describe('PATH_STEPS 6-8: own-line unstacks A, a beside drop re-stacks B beside C, then repeats onto the row below', () => {
  it('drops B onto its own line (A, left alone, returns to full), drops C beside B, then repeats a left-beside drop onto D', async () => {
    const half = asInlineStyle(blockWidthStyle('1/2'))
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/2', rowStart: true }
    const b: Block = { id: 'b-b', type: 'text', content: 'b', width: '1/2' }
    const c: Block = { id: 'b-c', type: 'text', content: 'c' }
    const d: Block = { id: 'b-d', type: 'text', content: 'd' }
    const { onChange } = renderCanvas([a, b, c, d])
    const lastBlocks = () => onChange.mock.calls[onChange.mock.calls.length - 1][0] as Block[]

    // Step 6: drag B onto its own line, dropped above C — the row directly
    // below A+B. y=10 of a 100-tall rect is the top 25%: own-line above.
    // A is the one mate left behind, so it returns to full.
    jest.spyOn(blockRoot('b-c'), 'getBoundingClientRect').mockReturnValue(rect(0, 400, 0, 100))
    fireEvent.dragStart(blockRoot('b-b'))
    fireDragOver('b-c', 200, 10)
    fireDrop('b-c', 200, 10)

    await waitFor(() => {
      expect(lastBlocks()).toEqual([
        { ...a, width: 'full' },
        { ...b, width: 'full', rowStart: true },
        c,
        d,
      ])
    })
    expect(sizingWidth('b-a')).toBe('100%')

    // Step 7: drag C onto B's right zone — a preview appears, then the drop
    // puts B and C side by side. A stays full; it was not in that row.
    jest.spyOn(blockRoot('b-b'), 'getBoundingClientRect').mockReturnValue(rect(0, 400))
    fireEvent.dragStart(blockRoot('b-c'))
    fireDragOver('b-b', 360, 50)
    expect(document.getElementById('block-b-c::ghost')).toBeNull()
    expect(dropBar('b-b')!.getAttribute('data-zone')).toBe('right')
    fireDrop('b-b', 360, 50)

    await waitFor(() => {
      expect(lastBlocks()).toEqual([
        { ...a, width: 'full' },
        { ...b, width: '1/2', rowStart: true },
        { ...c, width: '1/2' },
        d,
      ])
    })
    expect(sizingWidth('b-a')).toBe('100%')

    // Step 8: repeat a beside drop, now onto the LEFT zone of the row
    // directly below the dragged block (D) — it still commits.
    jest.spyOn(blockRoot('b-d'), 'getBoundingClientRect').mockReturnValue(rect(0, 400))
    fireEvent.dragStart(blockRoot('b-c'))
    fireDragOver('b-d', 40, 50)
    expect(dropBar('b-d')!.getAttribute('data-zone')).toBe('left')
    fireDrop('b-d', 40, 50)

    await waitFor(() => {
      expect(lastBlocks()).toEqual([
        { ...a, width: 'full' },
        { ...b, width: '1/2', rowStart: true },
        { ...c, width: '1/2', rowStart: true },
        { ...d, width: '1/2' },
      ])
    })
    expect([sizingWidth('b-a'), sizingWidth('b-b'), sizingWidth('b-c'), sizingWidth('b-d')]).toEqual([
      '100%',
      half,
      half,
      half,
    ])
  })
})
