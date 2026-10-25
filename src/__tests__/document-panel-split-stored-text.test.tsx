/**
 * KAN-552's "no write on read" break case: a page whose STORED blocks are one
 * multi-paragraph text block reads through `getPage`'s `mapRow` (`toBlocks` →
 * `splitStoredText`) as one block per paragraph — proven here by handing
 * `getPage`'s mock the real `toBlocks`' own output, the same shape the real
 * `mapRow` would produce. Reloading that page must write nothing: the split is
 * a read-time view, not an edit. Only a person's own edit saves, and it saves
 * the split shape (stable ids), not the stored one.
 */

import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import { toBlocks } from '@/lib/pages/to-blocks'
import type { Block } from '@/lib/documents/types'
import { writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
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
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  saveBlocks: jest.fn().mockResolvedValue(undefined),
  saveProps: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn(), rememberPending: jest.fn(), markPendingFailed: jest.fn() },
}))

// The stored row: ONE text block holding four paragraphs — what a page saved
// before KAN-506's slice A still holds.
const storedBlock: Block = { id: 'b1', type: 'text', content: 'alpha\n\nbeta\n\ngamma\n\ndelta' }
// What the real `mapRow` (`getPage` → `toBlocks` → `splitStoredText`) returns
// for that row — computed with the real function, not hand-written, so this
// test fails if the split logic itself ever changes shape.
const splitBlocks = toBlocks([storedBlock])

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks: splitBlocks, props: {} })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
    el.getAttribute('data-block-id')
  )

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('KAN-552 — reloading a split-on-read page writes nothing; a person\'s edit saves the split shape', () => {
  it('renders four blocks, saves nothing on load, then saves the split shape on edit', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    await waitFor(() => expect(blockIds()).toEqual(['b1', 'b1-2', 'b1-3', 'b1-4']))

    // Reload without editing: advance past the debounced save's own pause —
    // nothing was ever scheduled, so nothing lands.
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockCommitBlocks).not.toHaveBeenCalled()

    // Type in the second block.
    const secondField = await within(document.getElementById('block-b1-2')!).findByRole(
      'textbox',
      { name: 'text block' }
    )
    writeInTextBlock(secondField, 'beta!')

    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1))
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    expect(savedBlocks.map((b) => b.id)).toEqual(['b1', 'b1-2', 'b1-3', 'b1-4'])
    expect(savedBlocks.find((b) => b.id === 'b1-2')).toMatchObject({ content: 'beta!' })
  })
})
