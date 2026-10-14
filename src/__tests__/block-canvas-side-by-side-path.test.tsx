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
import { undoStep } from '@/lib/change-log/undo'
import { blockWidthStyle } from '@/lib/modules/layout-rows'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

// Part 2 (⌘Z) overrides this to the pond `sessionUndo.remember`'s guard needs;
// every other test here keeps the part-1 default (null skips `remember`).
const mockUsePondId = jest.fn<string | null, []>(() => null)
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => mockUsePondId(),
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

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
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
})

function renderPath(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <PondCommand
          path={{ glyph: 'ramp', trail: ['life'], current: 'Workshop', role: null }}
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
    fireEvent.dragStart(blockRoot('b-table'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOverAt('b-list', rect(0, 400), 360, 50)

    expect(dropBar('b-list')!.getAttribute('data-zone')).toBe('right')
    // Full + full, room < 1/4: equal share for two is 1/2 each — the held
    // block's live preview, before drop.
    expect(sizingWidth('b-table')).toBe(asInlineStyle(blockWidthStyle('1/2')))

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
    fireEvent.dragStart(blockRoot('b-table'))
    dragOverAt('b-list', rect(0, 400, 0, 100), 200, 90)
    expect(dropBar('b-list')!.getAttribute('data-zone')).toBe('below')

    dropAt('b-list', rect(0, 400, 0, 100), 200, 90)

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(sizingWidth('b-table')).toBe('100%'))
    // The row's other block keeps the width it already had — Pond doesn't
    // widen what's left behind.
    expect(sizingWidth('b-list')).toBe(asInlineStyle(blockWidthStyle('1/2')))
    expect(blockOrder()).toEqual(['b-text', 'b-list', 'b-table'])

    // 4. Switch to ink and drag once more: the drop line still carries
    // `bg-mn-text` (no `dark:` escape hatch, one role class resolves per
    // theme — `change-log-page-dark-theme.test.tsx`'s own proof), while
    // `document.documentElement` carries `.dark`.
    await user.click(screen.getByRole('button', { name: 'dark mode' }))
    expect(document.documentElement).toHaveClass('dark')

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
    fireEvent.dragStart(blockRoot('b-table'))
    // x=360 of a 400-wide rect is 90% across: the outer-right 25%, beside-right.
    dragOverAt('b-list', rect(0, 400), 360, 50)
    dropAt('b-list', rect(0, 400), 360, 50)

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
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
})
