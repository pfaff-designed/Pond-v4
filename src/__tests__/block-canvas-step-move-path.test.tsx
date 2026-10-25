/**
 * KAN-376 path test — PATH_STEPS 2–5, walked with real keyboard input
 * (`userEvent.keyboard`) on the actual surface a person uses: `ShellCommands`
 * (the ⌘Z owner) beside `DocumentPanel`, same harness as
 * `block-canvas-move-undo-path.test.tsx` (KAN-368). Asserts the DOM a person
 * sees — block order AND which row each block renders in — not only the
 * shape handed to `mockSaveBlocks`: `BlockCanvas` renders one forced
 * `aria-hidden` break before every row after the first (its own doc comment,
 * ~line 2289), so counting those breaks before a block's own sizing wrapper
 * gives that block's rendered row index without reading any CSS geometry
 * jsdom cannot compute.
 */

import React, { StrictMode } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { resetPageWriteRegistry } from '@/lib/pages/page-flush'
import { undoStep } from '@/lib/change-log/undo'
import { findAllTextBlocks, findTextBlock } from '@/__tests__/helpers/text-block'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

const mockGetUser = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: (...args: unknown[]) => mockGetUser(...args) } }),
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

jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

let recordSeq = 0

beforeEach(() => {
  resetPageWriteRegistry()
  jest.clearAllMocks()
  recordSeq = 0
  mockSaveBlocks.mockResolvedValue(undefined)
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  onPlatform('MacIntel')
  sessionUndo.clear()
})

afterEach(() => jest.restoreAllMocks())

function renderPath(blocks: Block[], { strict = false }: { strict?: boolean } = {}) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const blockRoot = (id: string) => document.getElementById(`block-${id}`)!
const blockOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
    el.getAttribute('data-block-id')
  )

// Each block's sizing wrapper (the div carrying its rendered width) is its
// `[data-block-id]` root's own parent; that wrapper's parent is the canvas's
// one flat list, where a forced `aria-hidden` break sits before every row
// after the first. Counting those breaks ahead of a block's wrapper is its
// rendered row index — the row grouping a person actually sees, read from
// the DOM the canvas drew, not from any block's stored `width`/`rowStart`.
const rowIndexOf = (id: string): number => {
  const wrapper = blockRoot(id).parentElement!
  const siblings = Array.from(wrapper.parentElement!.children)
  const at = siblings.indexOf(wrapper)
  return siblings.slice(0, at).filter((el) => el.hasAttribute('aria-hidden')).length
}

// Non-text (tabIndex 0): the row itself can take keyboard focus and become
// "selected" (07.05) without KAN-367, unlike a text block.
const table = (id: string, name: string, width?: '1/2', rowStart?: boolean): Block => ({
  id,
  type: 'table',
  columns: ['Tool'],
  rows: [{ id: `r-${id}`, cells: [name] }],
  ...(width ? { width } : {}),
  ...(rowStart ? { rowStart: true } : {}),
})

describe('PATH_STEPS 2–5: ⌥↓ past a row, ⌥→ a row-swap, ⌥↓ off a row, ⌘Z twice (KAN-376)', () => {
  it('walks the person path with real keyboard input and renders the row grouping they see at every step', async () => {
    const text: Block = { id: 'b-text', type: 'text', content: 'full' }
    const a = table('b-a', 'Saw', '1/2', true)
    const b = table('b-b', 'Plane', '1/2')
    renderPath([text, a, b])
    const field = await findTextBlock()
    const user = userEvent.setup()

    // Before any step: text alone on row 0, the ½+½ row is row 1.
    expect(rowIndexOf('b-text')).toBe(0)
    expect(rowIndexOf('b-a')).toBe(1)
    expect(rowIndexOf('b-b')).toBe(1)

    // Step 2 — caret in the text block, ⌥↓: it steps below the WHOLE row,
    // which stays intact as one row (not split by the moved block). jsdom has
    // no `elementFromPoint`, which ProseMirror's own mousedown handler needs
    // to place the caret from a click — a real `.focus()` is the caret entry
    // jsdom allows; the move itself is real keyboard input from there on.
    act(() => field.focus())
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-a', 'b-b', 'b-text']))
    expect(rowIndexOf('b-a')).toBe(rowIndexOf('b-b'))
    expect(rowIndexOf('b-text')).toBeGreaterThan(rowIndexOf('b-a'))

    // Step 3 — click the left card's body (selects the row), ⌥→: the two
    // halves swap places, still rendered as one row.
    await user.click(blockRoot('b-a'))
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-a', 'b-text']))
    expect(rowIndexOf('b-a')).toBe(rowIndexOf('b-b'))

    // Step 4 — ⌥↓ on that still-selected card: it leaves the row onto its
    // own full line below, rendered on its own row; the mate left behind
    // renders on its own row too, distinct from both.
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-a', 'b-text']))
    const rowB = rowIndexOf('b-b')
    const rowA = rowIndexOf('b-a')
    const rowText = rowIndexOf('b-text')
    expect(new Set([rowB, rowA, rowText]).size).toBe(3)
    expect(rowB).toBeLessThan(rowA)
    expect(rowA).toBeLessThan(rowText)

    // Step 5 — ⌘Z undoes the last move (step 4's own-line step); ⌘Z again
    // undoes the swap (step 3) — each press its own step, most-recent-first.
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-3'],
    })

    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
    expect(undoStep).toHaveBeenLastCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-2'],
    })
  })
})

describe('break: ⌥→ with the caret in text jumps a word, never reaching the block swap (KAN-376)', () => {
  it('leaves order and row grouping unchanged when the text block has a real row-mate', async () => {
    // The text block must itself have a row-mate — otherwise `planRowSwap`
    // returns null regardless of the guard, and the test would pass even
    // with the guard deleted.
    const text: Block = {
      id: 'b-text',
      type: 'text',
      content: 'full width here',
      width: '1/2',
      rowStart: true,
    }
    const b = table('b-b', 'Plane', '1/2')
    renderPath([text, b])
    const field = await findTextBlock()
    const user = userEvent.setup()

    // `userEvent` dispatches a real, cancelable `KeyboardEvent` — capture it
    // to confirm the browser's own word-jump survives (nothing called
    // `preventDefault`), not only that the save never fired.
    let arrowRight: KeyboardEvent | undefined
    const captureArrowRight = (e: Event) => {
      if ((e as KeyboardEvent).key === 'ArrowRight' && (e as KeyboardEvent).altKey) {
        arrowRight = e as KeyboardEvent
      }
    }
    field.addEventListener('keydown', captureArrowRight)

    act(() => field.focus())
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')

    field.removeEventListener('keydown', captureArrowRight)
    expect(arrowRight?.defaultPrevented).toBe(false)
    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(blockOrder()).toEqual(['b-text', 'b-b'])
    expect(rowIndexOf('b-text')).toBe(rowIndexOf('b-b'))
  })
})

// Live in the dev app, ⌥↓ from the caret re-inserts the moved block's node,
// and React 19's StrictMode then re-runs the moved fiber's effects: tiptap's
// EditorContent unmounts and remounts around the same editor DOM and blurs it
// after the commit (KAN-376 re-verify, measured). Next runs StrictMode in dev,
// so these tests render inside it, which is what makes them fail without the
// restore that runs after that remount.
describe('⌥↓/⌥↑ from the caret keeps focus in the moved block’s own editor (KAN-376 live verify)', () => {
  it('two ⌥↓ presses from the caret each find focus still in the moved block, and two ⌘Z steps undo one move each', async () => {
    const blocks: Block[] = [
      { id: 'b-1', type: 'text', content: 'one' },
      { id: 'b-2', type: 'text', content: 'two' },
      { id: 'b-3', type: 'text', content: 'three' },
    ]
    renderPath(blocks, { strict: true })
    const [first] = await findAllTextBlocks()
    const user = userEvent.setup()

    // Caret entry, same as the other caret-origin tests here: jsdom has no
    // `elementFromPoint` for a real click to place it.
    act(() => first.focus())
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-2', 'b-1', 'b-3']))
    // The commit re-inserts b-1's own DOM node; without the fix (and the
    // StrictMode remount this suite renders in) focus falls to <body>
    // here, and the second ⌥↓ below has nowhere to fire from.
    await waitFor(() => expect(blockRoot('b-1').contains(document.activeElement)).toBe(true))

    // `user.keyboard` with no explicit target fires on `document.activeElement`
    // — exactly what a second real keypress would reach.
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(blockOrder()).toEqual(['b-2', 'b-3', 'b-1']))
    await waitFor(() => expect(blockRoot('b-1').contains(document.activeElement)).toBe(true))

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-2'],
    })

    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
    expect(undoStep).toHaveBeenLastCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })

  it('⌥↑ from the caret also keeps focus in the moved block', async () => {
    const blocks: Block[] = [
      { id: 'b-1', type: 'text', content: 'one' },
      { id: 'b-2', type: 'text', content: 'two' },
    ]
    renderPath(blocks, { strict: true })
    const fields = await findAllTextBlocks()
    const second = fields[1]
    const user = userEvent.setup()

    act(() => second.focus())
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-2', 'b-1']))
    await waitFor(() => expect(blockRoot('b-2').contains(document.activeElement)).toBe(true))
  })
})
