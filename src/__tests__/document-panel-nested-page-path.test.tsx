/**
 * PATH_STEPS 1–6 (KAN-122), on the real page-hosting surface: `DocumentPanel`
 * mounts `BlockCanvas` the same way the running app does, so this proves the
 * `/ nested page` row's effect end to end — not `PageLinkView` in isolation.
 * Steps 7–8 (new clears on open, trash/restore) are the pglite/unit tests in
 * the `openedAt` and rows-cache PLAN items, not re-asserted here.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { writeInTextBlock } from './helpers/text-block'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

const NOW = new Date().toISOString()
const PARENT_ROW = {
  id: 'page-1',
  parent_id: null,
  type: 'page',
  title: 'kitchen renovation',
  order: 0,
  updated_at: NOW,
}
// The initial load resolves with the parent alone. `makePage`'s own
// `invalidateQueries` refetch (the SECOND call) is left pending indefinitely —
// the REAL `insertPageOptimistic` (unmocked below) is the only thing that can
// put the child's row, with its `new`/`nestedFrom` props, into the `['pages']`
// cache before that refetch ever lands. Proves the chip shows at once, not
// after a refetch.
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

const mockGetPage = jest.fn()
const mockCreatePage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  saveBlocks: jest.fn().mockResolvedValue(undefined),
  saveProps: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
  createPageWriter: jest.fn(() => jest.fn().mockResolvedValue(undefined)),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
}))

const blocks: Block[] = [
  { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' },
  { id: 'b-slash', type: 'text', content: '' },
]

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'kitchen renovation', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValueOnce([PARENT_ROW]).mockImplementation(() => new Promise(() => {})) // the post-create refetch never resolves
  mockCreatePage.mockResolvedValue({ id: 'new-page', title: 'untitled', type: 'page' })
})

describe('`/ nested page` on the real page-hosting surface (KAN-122 path test)', () => {
  it('leaves a page-link row in place, stays on the parent, and opens the child on click', async () => {
    const user = userEvent.setup()
    renderPanel()

    await screen.findByLabelText('Page title')
    const field = await within(document.getElementById('block-b-slash')!).findByRole('textbox', {
      name: 'text block',
    })
    writeInTextBlock(field, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(field, '/page')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const pageRow = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'page')!
    fireEvent.click(pageRow)

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    expect(mockCreatePage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({
        parentId: 'page-1',
        props: expect.objectContaining({ kind: 'nested page', nestedFrom: 'page-1' }),
      })
    )

    // The `/` line is gone, replaced at the same index — no navigation away.
    expect(document.getElementById('block-b-slash')).not.toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()

    const row = await screen.findByRole('button', { name: 'Open untitled' })
    const blockEls = [...document.querySelectorAll('[id^="block-"]')]
    expect(blockEls[1]).toContainElement(row)

    // `new` and `0 blocks` show at once off the optimistic insert — `fetchPages`
    // (mocked above) never returns the child's row at all.
    expect(await within(row).findByText('new')).toBeInTheDocument()
    expect(within(row).getByText('0 blocks')).toBeInTheDocument()
    expect(within(row).getByText('untitled')).toBeInTheDocument()

    await user.click(row)
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush.mock.calls[0][0]).toEqual(expect.stringContaining('nodeId=new-page'))
  })
})
