/**
 * The side-by-side path (6x): `DocumentPanel` mounted with the real
 * `BlockCanvas` it hosts, PLUS the real `PondCommand` (for its mode toggle) —
 * proves the drag beside, drop, own-line-drop, and equal-share paths all fire
 * from the surface a person actually reaches, not `BlockCanvas` fed hand-picked
 * props. Geometry mocking follows `block-canvas-beside-drop.test.tsx`/
 * `block-canvas-drop-line.test.tsx`'s own pattern (jsdom has no layout); the
 * handle press goes through `userEvent` on the real "Block menu" button
 * (`title="Block menu · drag to reorder"`) since that is how a person arms the
 * drag — the HTML5 drag sequence itself still goes through `fireEvent`, since
 * neither jsdom nor `userEvent` implements native drag-and-drop.
 *
 * Part 2, below: the real `ShellCommands` (the ⌘Z/⇧⌘Z owner) mounted beside
 * `DocumentPanel`, pressing ⌘Z after a beside drop — proves the drop's
 * `sessionUndo.remember` and the shell's `sessionUndo.undo` share one real
 * stack (`session-undo.ts` is left real here, like `undo-accept-path.test.tsx`;
 * only the RPC boundary, `@/lib/change-log/undo`, is mocked).
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { PondCommand } from '@/components/organisms/PondCommand'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { appendOwnEdit } from '@/lib/change-log/store'
import { undoStep } from '@/lib/change-log/undo'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'

// The page-write queue (KAN-495) is a module-level registry keyed by page
// id that deliberately outlives a `DocumentPanel` unmount, so sharing one
// page id across `it()`s hands a later test the earlier one's writer —
// closed over whatever `pondId` was in scope when that queue was first
// created — instead of its own. Each test gets a fresh id (`mockPageId`,
// the `mock`-prefixed name babel-plugin-jest-hoist requires to reference it
// from this hoisted factory).
let mockPageIdCounter = 0
let mockPageId = 'page-1'
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockPageId : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

// Part 2 (⌘Z) overrides this to the pond `sessionUndo.remember`'s guard needs;
// every other test here keeps the part-1 default (null skips `remember`).
// `usePond()` is overridden alongside `usePondId()`, from the SAME value: in
// production both read one `PondContext`, so `DocumentPanel` (which reads
// `usePond().pond?.id`, not `usePondId()`) and `ShellCommands` (which reads
// `usePondId()` directly) always agree. Leaving only `usePondId` mocked made
// `DocumentPanel` fall through to the real `PondContext`'s no-provider
// default (`pond: null`) regardless of what this mock returned — the write
// landed with `pondId: null` even while `usePondId()` reported `'pond-1'`.
const mockUsePondId = jest.fn<string | null, []>(() => null)
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => mockUsePondId(),
  usePond: () => {
    const id = mockUsePondId()
    return {
      pond: id ? { id, name: null, glyph: null } : null,
      ponds: [],
      loading: false,
      reload: jest.fn(),
      addPond: jest.fn(),
    }
  },
}))

const mockFetchPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
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

// `@/lib/pages/commit` is left REAL here (unlike the old direct-write tests):
// the queue's writer (KAN-495) is `createPageWriter`, which calls `commitBlocks`
// internally — mocking `commitBlocks` at this level would also have to stand in
// for `createPageWriter`, duplicating what `commitBlocks` already does. Only the
// boundary it writes through (`saveBlocks` above, `appendOwnEdit`/`markOutdated`
// below, and `fetch` for `reembedPage`) is mocked — same pattern as
// `block-canvas-beside-drop.test.tsx`.
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
  markOutdated: jest.fn().mockResolvedValue(undefined),
}))
// `session-undo.ts` stays real here (unlike part 1, and like `undo-accept-path.test.tsx`):
// part 2 proves the drop's `remember` and ⌘Z's `undo` share one real stack, not two
// mocks that happen to agree. Only the RPC boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([])
  mockSaveBlocks.mockResolvedValue(undefined)
  mockUsePondId.mockReturnValue(null)
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  sessionUndo.clear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  mockPageId = `page-${++mockPageIdCounter}`
})

function renderPath(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: mockPageId, title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <PondCommand
          path={{
            glyph: 'ramp',
            trail: [{ title: 'life', to: { kind: 'home' } }],
            current: 'Workshop',
            role: null,
          }}
          open={false}
          items={[]}
          onSelect={jest.fn()}
          onOpenChange={jest.fn()}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const sizingWidth = (blockId: string) => (blockRoot(blockId).parentElement as HTMLElement).style.width
const dropBar = (blockId: string) => blockRoot(blockId).querySelector('[data-part="drop-bar"]')
const blockOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map(
    (el) => el.getAttribute('data-block-id')
  )

/**
 * Row membership as a person would see it: every `block-*` node in DOM
 * order, split wherever an explicit row-break sibling (KAN-440) sits right
 * before its sizing div — not re-packed by width, since `rowStart` can
 * split a row with room left over (`block-canvas-drag-ghost.test.tsx`'s own
 * `renderedRows`; no ghost is ever on screen here, so no ghost/row-break
 * disambiguation is needed).
 */
function renderedRows(): string[][] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[id^="block-"]'))
  const rows: string[][] = []
  for (const el of elements) {
    const sizingDiv = el.parentElement as HTMLElement
    const breakBefore = sizingDiv.previousElementSibling
    const isRowBreak = breakBefore?.getAttribute('aria-hidden') === 'true' && breakBefore.childElementCount === 0
    if (rows.length === 0 || isRowBreak) rows.push([])
    rows[rows.length - 1].push(el.id.replace(/^block-/, ''))
  }
  return rows
}

// jsdom's CSSOM re-serializes a `calc()` expression rather than keeping
// `blockWidthStyle`'s own string — round-trip through an element's
// `style.width`, same as `block-canvas-beside-preview.test.tsx`.
function asInlineStyle(width: string): string {
  const el = document.createElement('div')
  el.style.width = width
  return el.style.width
}

function rect(left: number, width: number, top = 0, height = 100): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height } as DOMRect
}

/**
 * Mocks `targetId`'s rect: dragstart snapshots every block's rect (KAN-440), so
 * this must run BEFORE a caller's `fireEvent.dragStart` — mocking afterward (as
 * `dragOverAt` also does, for a real drag's live re-read) is invisible to the
 * classification the snapshot drives.
 */
function mockRect(targetId: string, targetRect: DOMRect) {
  jest.spyOn(blockRoot(targetId), 'getBoundingClientRect').mockReturnValue(targetRect)
}

function dragOverAt(targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  const event = new MouseEvent('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

function dropAt(targetId: string, targetRect: DOMRect, x: number, y: number) {
  const target = blockRoot(targetId)
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue(targetRect)
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}

async function armHandle(user: ReturnType<typeof userEvent.setup>, blockId: string) {
  const handle = within(blockRoot(blockId)).getByRole('button', { name: 'Block menu' })
  await user.pointer({ keys: '[MouseLeft>]', target: handle })
}

describe('the side-by-side path (6x), minus ⌘Z', () => {
  it('drags the table beside the list, pops it out onto its own line, then grows a fresh pair to thirds', async () => {
    const text: Block = { id: 'b-text', type: 'text', content: 'Notes on the workbench build' }
    const list: Block = {
      id: 'b-list',
      type: 'todo',
      items: [{ id: 'item-1', label: 'Sand the top', checked: false }],
    }
    const table: Block = {
      id: 'b-table',
      type: 'table',
      columns: ['Tool'],
      rows: [{ id: 'r1', cells: ['Table Saw'] }],
    }
    renderPath([text, list, table])
    await screen.findByLabelText('Page title')
    const user = userEvent.setup()

    // 1. Press the table's handle, drag it over the list's right edge.
    await armHandle(user, 'b-table')
    mockRect('b-list', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-table'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOverAt('b-list', rect(0, 400), 360, 50)

    expect(dropBar('b-list')!.getAttribute('data-zone')).toBe('right')
    // The bar is the preview. The table stays full width until the drop lands.
    expect(document.getElementById('block-b-table::ghost')).toBeNull()
    expect(sizingWidth('b-table')).toBe('100%')
    expect(sizingWidth('b-list')).toBe('100%')

    // 2. Drop: list and table land side by side at 1/2 each, list then table.
    dropAt('b-list', rect(0, 400), 360, 50)

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(sizingWidth('b-list')).toBe(asInlineStyle(blockWidthStyle('1/2'))))
    expect(sizingWidth('b-table')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    expect(blockOrder()).toEqual(['b-text', 'b-list', 'b-table'])

    // 3. Drag the table below the row: own-line, under both halves. The
    // dragged block can't be its own drop target, so the hover lands on the
    // row's OTHER member (list) — same as a person's pointer would, since it
    // never fires a `dragover` the browser routes back onto the dragged node.
    mockRect('b-list', rect(0, 400, 0, 100))
    fireEvent.dragStart(blockRoot('b-table'))
    dragOverAt('b-list', rect(0, 400, 0, 100), 200, 90)
    expect(dropBar('b-list')!.getAttribute('data-zone')).toBe('below')

    dropAt('b-list', rect(0, 400, 0, 100), 200, 90)

    // 2 calls, one per drop: both drops now write through the ONE structural
    // entry point (KAN-495's `writeStructural`), not the old enqueue-then-
    // `onChange` pair — so drop 1 never leaves a debounced typed save behind
    // for drop 2's `flushNow()` to find and re-enqueue.
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(sizingWidth('b-table')).toBe('100%'))
    // The list is the one block left of the pair, so it returns to full
    // width and the stack is vertical again.
    expect(sizingWidth('b-list')).toBe('100%')
    expect(blockOrder()).toEqual(['b-text', 'b-list', 'b-table'])

    // 4. Switch to ink and drag once more: the drop line still carries
    // `bg-mn-text` (no `dark:` escape hatch, one role class resolves per
    // theme — `change-log-page-dark-theme.test.tsx`'s own proof), while
    // `document.documentElement` carries `.dark`.
    await user.click(screen.getByRole('button', { name: 'dark mode' }))
    expect(document.documentElement).toHaveClass('dark')

    mockRect('b-list', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-table'))
    dragOverAt('b-list', rect(0, 400), 360, 50)
    const bar = dropBar('b-list')!
    expect(bar).toHaveClass('bg-mn-text')
    expect(bar.className).not.toMatch(/\bdark:/)
  })

  it('drags a third block beside a fresh 1/2+1/2 row: all three become 1/3 (Jira acceptance)', async () => {
    const left: Block = {
      id: 'b-left',
      type: 'todo',
      items: [{ id: 'item-1', label: 'Sand the top', checked: false }],
      width: '1/2',
    }
    const right: Block = {
      id: 'b-right',
      type: 'table',
      columns: ['Tool'],
      rows: [{ id: 'r1', cells: ['Table Saw'] }],
      width: '1/2',
    }
    const third: Block = { id: 'b-third', type: 'text', content: 'Notes on the workbench build' }
    renderPath([left, right, third])
    await screen.findByLabelText('Page title')
    const user = userEvent.setup()

    await armHandle(user, 'b-third')
    mockRect('b-right', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-third'))
    // x=360 of a 400-wide rect is 90% across: beside-right of `right`.
    dragOverAt('b-right', rect(0, 400), 360, 50)
    expect(dropBar('b-right')!.getAttribute('data-zone')).toBe('right')

    dropAt('b-right', rect(0, 400), 360, 50)

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(sizingWidth('b-left')).toBe(asInlineStyle(blockWidthStyle('1/3'))))
    expect(sizingWidth('b-right')).toBe(asInlineStyle(blockWidthStyle('1/3')))
    expect(sizingWidth('b-third')).toBe(asInlineStyle(blockWidthStyle('1/3')))
    expect(blockOrder()).toEqual(['b-left', 'b-right', 'b-third'])
  })
})

function renderPathWithShell(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: mockPageId, title: 'Workshop', blocks })
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

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

describe('the side-by-side path (6x), part 2: ⌘Z after a beside drop', () => {
  afterEach(() => jest.restoreAllMocks())

  it('⌘Z runs sessionUndo.undo for this pond and steps back exactly the drop’s one record', async () => {
    onPlatform('MacIntel')
    mockUsePondId.mockReturnValue('pond-1')
    const list: Block = {
      id: 'b-list',
      type: 'todo',
      items: [{ id: 'item-1', label: 'Sand the top', checked: false }],
    }
    const table: Block = {
      id: 'b-table',
      type: 'table',
      columns: ['Tool'],
      rows: [{ id: 'r1', cells: ['Table Saw'] }],
    }
    renderPathWithShell([list, table])
    await screen.findByLabelText('Page title')
    const user = userEvent.setup()

    await armHandle(user, 'b-table')
    mockRect('b-list', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-table'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOverAt('b-list', rect(0, 400), 360, 50)
    dropAt('b-list', rect(0, 400), 360, 50)

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    // The revert's own block restore is `undo.ts`'s already-tested path; this
    // proves only that the shell's ⌘Z reaches the real session stack the drop
    // remembered, for this pond, with exactly the drop's one record.
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })

  it('undo restores the flag (KAN-440): a landed ⌘Z redraws the exact pre-drop rows and widths', async () => {
    onPlatform('MacIntel')
    mockUsePondId.mockReturnValue('pond-1')
    // `d`(1/4) leaves room `a`(1/4) would otherwise pack into — only `a`'s own
    // `rowStart` keeps it on its own row, so a restore that dropped the flag
    // would show up here as `d` and `a` sharing a row.
    const d: Block = { id: 'b-d', type: 'text', content: 'd', width: '1/4' }
    const a: Block = { id: 'b-a', type: 'text', content: 'a', width: '1/4', rowStart: true }
    const b: Block = { id: 'b-b', type: 'text', content: 'b' }
    renderPathWithShell([d, a, b])
    await screen.findByLabelText('Page title')
    const user = userEvent.setup()

    expect(renderedRows()).toEqual([['b-d'], ['b-a'], ['b-b']])

    // Drag b onto a's LEFT edge: b splices before a and becomes the row's new
    // `rowStart`; a's own flag is cleared (`planBesideDrop`'s reading-order rule).
    await armHandle(user, 'b-b')
    mockRect('b-a', rect(0, 400))
    fireEvent.dragStart(blockRoot('b-b'))
    // x=40 of a 400-wide rect is 10% across: the outer-left 25%, beside-left of a.
    dragOverAt('b-a', rect(0, 400), 40, 50)
    expect(dropBar('b-a')!.getAttribute('data-zone')).toBe('left')
    dropAt('b-a', rect(0, 400), 40, 50)

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-d', 'b-b', 'b-a']))
    // The drop is one structural op on the page's write queue (KAN-495): its
    // record must be appended (the queue idle, so `saved` is back to `true`)
    // before the undo's refetch can be adopted.
    await waitFor(() => expect(jest.mocked(appendOwnEdit)).toHaveBeenCalledTimes(1))

    const undoRecord: ChangeLogRecord = {
      id: 'undo-rec-1',
      userId: 'user-1',
      pondId: 'pond-1',
      status: 'accepted',
      action: 'undo',
      actor: 'you',
      targetPageId: mockPageId,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: {},
      transitions: [],
      createdAt: '2026-10-18T00:00:00.000Z',
      statusAt: '2026-10-18T00:00:00.000Z',
    }
    jest.mocked(undoStep).mockResolvedValueOnce({ outcome: 'done', records: [undoRecord] })

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))

    // The RPC boundary is mocked, but the redraw is real: `undoStep`'s `done`
    // invalidates `['page', mockPageId]`, the panel refetches `getPage` (still
    // resolving its original `[d, a, b]`, since nothing ever told the mock the
    // server changed — exactly what a real undo RPC restoring the row would
    // leave it holding), and the draft adopts it because the queue's head is
    // the POST-drop blocks, so the pre-drop blocks read back as changed.
    await waitFor(() => expect(blockOrder()).toEqual(['b-d', 'b-a', 'b-b']))
    expect(sizingWidth('b-d')).toBe(asInlineStyle(blockWidthStyle('1/4')))
    expect(sizingWidth('b-a')).toBe(asInlineStyle(blockWidthStyle('1/4')))
    expect(sizingWidth('b-b')).toBe('100%')
    // `a`'s `rowStart` is back — this is the part a plain widths-only restore
    // would get wrong: without it, `a` (1/4) would pack into `d`'s (1/4) room.
    expect(renderedRows()).toEqual([['b-d'], ['b-a'], ['b-b']])
  })
})
