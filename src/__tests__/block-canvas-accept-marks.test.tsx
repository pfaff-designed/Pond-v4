/**
 * KAN-143 fix: the block-level accept-mark cue drawn kind-agnostically in
 * `BlockEditor` (`BlockCanvas.tsx`), for every block whose block-level mark
 * isn't already drawn by a row renderer — a table, a labelled text block,
 * and (via `todo/view.tsx`'s own fallback) a todo whose accept only deleted
 * a row all carry "changed HH:MM"; an untouched block carries nothing, and
 * no block draws the mark twice.
 */

import React from 'react'
import { render, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { recordAccept, clear as clearAcceptMarks } from '@/lib/change-log/accept-marks'
import { formatClockTime } from '@/lib/change-log/page-changes'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const PAGE_ID = 'page-1'
const ACCEPTED_AT = '2026-10-17T07:13:00.000Z'
const CHANGED_TEXT = `changed ${formatClockTime(ACCEPTED_AT)}`

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId={PAGE_ID}
          pageTitle="verification scratch"
          onChange={() => {}}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!

afterEach(() => {
  clearAcceptMarks()
})

describe('BlockCanvas block-level accept marks (KAN-143)', () => {
  it('a table block and a labelled text block carrying block:<id> each render "changed HH:MM" once', () => {
    const table: Block = {
      id: 'b-table',
      type: 'table',
      columns: ['Tool', 'Location'],
      rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
    } as Block
    const labelledText: Block = { id: 'b-text', type: 'text', label: 'goal', content: 'ship it' } as Block

    recordAccept(PAGE_ID, [`block:${table.id}`, `block:${labelledText.id}`], 'rec-1', ACCEPTED_AT)
    renderCanvas([table, labelledText])

    expect(within(blockRoot('b-table')).getAllByText(CHANGED_TEXT)).toHaveLength(1)
    expect(within(blockRoot('b-text')).getAllByText(CHANGED_TEXT)).toHaveLength(1)
  })

  it('a todo accept that only deletes a row renders the block mark on the remaining row', () => {
    const todo: Block = {
      id: 'b-todo',
      type: 'todo',
      items: [
        { id: 'i2', label: 'worktop template', checked: false },
        { id: 'i3', label: 'tiles', checked: false },
      ],
    } as Block

    // The deleted item ('i1') is the only target `touchedMarks` records for a
    // pure delete — there is no `block:b-todo` entry, only the orphaned row
    // target, which must still land the mark on the block (the remaining
    // first row), per "otherwise the block".
    recordAccept(PAGE_ID, [`block:${todo.id}:row:i1`], 'rec-2', ACCEPTED_AT)
    renderCanvas([todo])

    const root = blockRoot('b-todo')
    expect(within(root).getAllByText(CHANGED_TEXT)).toHaveLength(1)
    const worktopRow = root.querySelector('[data-item-id="i2"]')!
    expect(within(worktopRow as HTMLElement).getByText(CHANGED_TEXT)).toBeTruthy()
  })

  it('an untouched block carries no mark', () => {
    const untouched: Block = {
      id: 'b-plain',
      type: 'table',
      columns: ['X'],
      rows: [{ id: 'r1', cells: ['Y'] }],
    } as Block

    renderCanvas([untouched])

    expect(within(blockRoot('b-plain')).queryByText(CHANGED_TEXT)).toBeNull()
  })

  it('no block renders the mark twice', () => {
    const table: Block = {
      id: 'b-table',
      type: 'table',
      columns: ['Tool'],
      rows: [{ id: 'r1', cells: ['Saw'] }],
    } as Block

    recordAccept(PAGE_ID, [`block:${table.id}`], 'rec-3', ACCEPTED_AT)
    renderCanvas([table])

    expect(document.querySelectorAll('[data-part="changed"]')).toHaveLength(1)
  })
})
