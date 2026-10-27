/**
 * KAN-373 slice A — ⌫/⌘⌫ on a focused row that is part of a multi-block
 * range deletes every block in the range as ONE `commitStructuralBlocks`
 * write (`detachRangeKeepingRows`, not a loop over `removeBlockAt`), with
 * one confirm (if any block holds content) and one toast, `deleted N
 * blocks ·`. Harness mirrors `block-canvas-beside-drop.test.tsx`: the real
 * page-write queue (`createPageWriter`/`createPageWriteQueue`), so the
 * `before` the change-log record carries is the exact pre-delete `blocks`
 * array — the same fact that proves KAN-440's drop-undo restores rowStart,
 * reused here to prove the range's own order/width/rowStart survive undo
 * with no separate restore path to test.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { getPageWriteQueue } from '@/lib/pages/page-flush'
import { createPageWriteQueue } from '@/lib/pages/page-write-queue'
import { createPageWriter } from '@/lib/pages/commit'
import { createClient } from '@/lib/supabase/client'
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

const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(),
  createPage: jest.fn(),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: jest.fn(),
  defineSchema: jest.fn(),
  deletePage: jest.fn(),
}))

const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
const mockMarkOutdated = jest.fn().mockResolvedValue([])
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  markOutdated: (...args: unknown[]) => mockMarkOutdated(...args),
}))
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    remember: (...args: unknown[]) => mockRemember(...args),
    trackPending: jest.fn(),
  },
}))

// Non-text (tabIndex 0): the row itself takes keyboard focus directly, same
// fixture shape as `block-canvas-range-select.test.tsx`.
const table = (
  id: string,
  name: string,
  extra?: { width?: Block['width']; rowStart?: boolean }
): Block => ({
  id,
  type: 'table',
  columns: ['Tool'],
  rows: [{ id: `r-${id}`, cells: [name] }],
  ...extra,
})

// Same registry hazard `block-canvas-beside-drop.test.tsx` notes: a fresh
// page id per test, since the write queue is keyed by page id and outlives unmount.
let mockPageIdCounter = 0
let mockPageId = 'page-1'

beforeEach(() => {
  jest.clearAllMocks()
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  mockPageId = `page-${++mockPageIdCounter}`
})

function renderCanvas(blocks: Block[], onChange: (next: Block[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onStructuralWrite = (next: Block[]): Promise<boolean> => {
    onChange(next)
    return getPageWriteQueue(mockPageId, () =>
      createPageWriteQueue(createPageWriter(createClient(), client, mockPageId, 'pond-1'), {
        title: 'sourdough, 78%',
        blocks,
      })
    )
      .enqueue({ kind: 'structural', after: { title: 'sourdough, 78%', blocks: next } })
      .then(() => true)
      .catch(() => false)
  }
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId={mockPageId}
          pageTitle="sourdough, 78%"
          onChange={onChange}
          onStructuralWrite={onStructuralWrite}
          onUndoRemove={() => {}}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (id: string) => document.getElementById(`block-${id}`)!

describe('⌫/⌘⌫ deletes a block range in one step (KAN-373)', () => {
  it('deletes 3 blocks in one write, confirms once, and stages one toast', async () => {
    const b0 = table('b-0', 'a')
    const b1 = table('b-1', 'b', { width: '1/2', rowStart: true })
    const b2 = table('b-2', 'c', { width: '1/2' })
    const b3 = table('b-3', 'd', { width: 'full', rowStart: true })
    const b4 = table('b-4', 'e')
    const blocks = [b0, b1, b2, b3, b4]
    let result: Block[] | null = null
    renderCanvas(blocks, (next) => {
      result = next
    })

    blockRoot('b-1').focus()
    fireEvent.keyDown(blockRoot('b-1'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-2'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-3'), { key: 'Backspace' })

    const dialogs = await screen.findAllByRole('alertdialog')
    expect(dialogs).toHaveLength(1)
    expect(screen.getByText('Delete 3 blocks?')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const written = mockAppendOwnEdit.mock.calls[0][1]
    expect(written.before).toBe(blocks)
    // Order and every removed block's exact rowStart/width survive in `before`
    // — undo swaps the page back to this array, with nothing else to restore.
    expect(written.before.slice(1, 4)).toEqual([b1, b2, b3])
    expect(written.after).toEqual([b0, b4])
    expect(result).toEqual([b0, b4])

    expect(await screen.findByText('deleted 3 blocks ·')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
  })

  it('a range covering every block leaves one empty line', async () => {
    const b0 = table('b-0', 'a')
    const b1 = table('b-1', 'b')
    const b2 = table('b-2', 'c')
    const blocks = [b0, b1, b2]
    let result: Block[] | null = null
    renderCanvas(blocks, (next) => {
      result = next
    })

    blockRoot('b-0').focus()
    fireEvent.keyDown(blockRoot('b-0'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-1'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-2'), { key: 'Backspace' })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const written = mockAppendOwnEdit.mock.calls[0][1]
    expect(written.after).toEqual([{ id: expect.any(String), type: 'text', content: '' }])
    expect(result).toEqual([{ id: expect.any(String), type: 'text', content: '' }])
  })
})
