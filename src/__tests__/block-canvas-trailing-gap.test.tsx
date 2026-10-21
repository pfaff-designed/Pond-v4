/**
 * Rule 3's trailing hit area (KAN-345): the space below the last block draws
 * nothing at rest, fades in a ghost row on hover, and a click lands on the
 * one empty line that area always leads to — minting one or reusing the one
 * already there, never two (G9).
 */

import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { TEXT_BLOCK_TOP_INSET_PX } from '@/lib/layout/surface-column'
import { BLOCK_ROW_GAP_PX } from '@/lib/modules/layout-rows'
import { findTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

function Harness({ initial, chrome }: { initial: Block[]; chrome?: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
      onChange={setBlocks}
      onUndoRemove={() => {}}
      chrome={chrome}
    />
  )
}

function renderHarness(initial: Block[], chrome?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} chrome={chrome} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('the trailing gap below the last block (KAN-345 rule 3)', () => {
  it('draws its ghost row at rest-opacity 0, fading in only on hover', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderHarness([note])
    await findTextBlock()

    const gap = screen.getByTestId('trailing-block-gap')
    const ghost = gap.querySelector('span')!
    expect(ghost.className).toContain('opacity-0')
    expect(ghost.className).toContain('group-hover/trailing-gap:opacity-100')
    expect(ghost.textContent).toBe('type, or / for blocks')
  })

  it('a click on a blank page adds exactly one new, focused empty text block', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderHarness([note])
    await findTextBlock()

    fireEvent.click(screen.getByTestId('trailing-block-gap'))

    const fields = await waitFor(() => {
      const found = screen.getAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })
    await waitFor(() => expect(fields[1]).toHaveFocus())
  })

  it('a second click while the new line is still empty focuses that same line, not a third block (G9)', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderHarness([note])
    await findTextBlock()

    const gap = screen.getByTestId('trailing-block-gap')
    fireEvent.click(gap)
    const fields = await waitFor(() => {
      const found = screen.getAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })
    await waitFor(() => expect(fields[1]).toHaveFocus())
    act(() => {
      fields[1].blur()
    })

    fireEvent.click(gap)

    await waitFor(() => expect(fields[1]).toHaveFocus())
    expect(screen.getAllByRole('textbox', { name: 'text block' })).toHaveLength(2)
  })

  it('a double click below the last block adds exactly one block, not two (G9)', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderHarness([note])
    await findTextBlock()

    const gap = screen.getByTestId('trailing-block-gap')
    fireEvent.click(gap)
    fireEvent.click(gap)

    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: 'text block' })).toHaveLength(2)
    })
  })

  it('a block inserted via the gap on a page whose last block is not text opens with the caret in it (KAN-345 rule 2: a line minted this session autofocuses)', async () => {
    const table: Block = {
      id: 'b-table',
      type: 'table',
      columns: ['Tool', 'Location'],
      rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
    }
    renderHarness([table])

    fireEvent.click(screen.getByTestId('trailing-block-gap'))

    const field = await findTextBlock()
    await waitFor(() => expect(field).toHaveFocus())
  })

  it('with chrome={false} (read-only), no trailing-gap hit area is in the DOM at all', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderHarness([note], false)
    await findTextBlock()

    expect(screen.queryByTestId('trailing-block-gap')).toBeNull()
  })

  it("offsets its ghost row by BLOCK_ROW_GAP_PX plus the text wrapper's own top inset, not a restated value — so the real line it opens sits where the ghost text sat", async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    renderHarness([note])
    await findTextBlock()

    const gap = screen.getByTestId('trailing-block-gap')
    expect(gap.style.paddingTop).toBe(`${BLOCK_ROW_GAP_PX + TEXT_BLOCK_TOP_INSET_PX}px`)
  })

  it('clicking while the last empty line\'s editor is still a stand-in neither throws nor adds a second block', async () => {
    const empty: Block = { id: 'b-empty', type: 'text', content: '' }
    renderHarness([empty])
    // Deliberately not awaiting the editor's mount: right after render, with
    // `immediatelyRender: false`, the field is still its static stand-in —
    // no `[role=textbox][contenteditable]` with `.editor` on it yet.
    const gap = screen.getByTestId('trailing-block-gap')

    expect(() => fireEvent.click(gap)).not.toThrow()

    await findTextBlock()
    expect(screen.getAllByRole('textbox', { name: 'text block' })).toHaveLength(1)
  })

  it('when the last block is already an empty text line, hovering paints THAT line\'s own placeholder — no second ghost text node below it', async () => {
    const empty: Block = { id: 'b-empty', type: 'text', content: '' }
    renderHarness([empty])
    await findTextBlock()

    const gap = screen.getByTestId('trailing-block-gap')
    expect(gap.querySelector('span')).toBeNull()
    expect(document.querySelector('[data-hover-ghost]')).toBeNull()

    fireEvent.mouseEnter(gap)
    expect(document.querySelector('[data-hover-ghost]')).not.toBeNull()

    fireEvent.mouseLeave(gap)
    expect(document.querySelector('[data-hover-ghost]')).toBeNull()
  })

  it('does not resurrect the hover-ghost on the unfocused last line when the gap unmounts and remounts with no mouseleave (chrome toggled off then on)', async () => {
    const empty: Block = { id: 'b-empty', type: 'text', content: '' }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (chrome: boolean) => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <Harness initial={[empty]} chrome={chrome} />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(tree(true))
    await findTextBlock()

    fireEvent.mouseEnter(screen.getByTestId('trailing-block-gap'))
    expect(document.querySelector('[data-hover-ghost]')).not.toBeNull()

    // Zen toggled by keyboard, say — the gap unmounts with the pointer still
    // "over" it, so no mouseleave ever fires.
    rerender(tree(false))
    expect(screen.queryByTestId('trailing-block-gap')).toBeNull()

    // Leaving zen remounts it — without a fresh hover, it must come back
    // un-ghosted.
    rerender(tree(true))

    expect(document.querySelector('[data-hover-ghost]')).toBeNull()
  })

  it('a line minted this session does not re-autofocus after a page switch away and back (KAN-345 rule 2: `autofocusIds` is page-scoped, not session-scoped)', async () => {
    const pages: Record<string, Block[]> = {
      'page-a': [{ id: 'b-note', type: 'text', content: 'note' }],
      'page-b': [{ id: 'b-other', type: 'text', content: 'other page' }],
    }
    function PageSwitchHarness({ pageId }: { pageId: string }) {
      const [blocksByPage, setBlocksByPage] = useState(pages)
      return (
        <BlockCanvas
          blocks={blocksByPage[pageId]}
          pageId={pageId}
          pageTitle="sourdough, 78%"
          onChange={(next) => setBlocksByPage((prev) => ({ ...prev, [pageId]: next }))}
          onUndoRemove={() => {}}
        />
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (pageId: string) => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <PageSwitchHarness pageId={pageId} />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(tree('page-a'))
    await findTextBlock()

    fireEvent.click(screen.getByTestId('trailing-block-gap'))
    const fields = await waitFor(() => {
      const found = screen.getAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })
    await waitFor(() => expect(fields[1]).toHaveFocus())

    // A real navigation away — page B's blocks carry none of page A's ids, so
    // page A's own editors (including the one just minted) unmount entirely.
    rerender(tree('page-b'))
    await findTextBlock()

    // Back to A: the SAME blocks (same ids, including the minted empty line)
    // remount fresh. Without rule 2's page-scoped reset, `autofocusIds` would
    // still carry that id from the earlier session action and re-autofocus it.
    rerender(tree('page-a'))
    const remounted = await waitFor(() => {
      const found = screen.getAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(remounted[1]).not.toHaveFocus()
    expect(remounted[1]).not.toHaveClass('ProseMirror-focused')
  })
})
