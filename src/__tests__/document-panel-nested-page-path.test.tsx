/**
 * PATH_STEPS 1–6 (KAN-122), on the real page-hosting surface: `DocumentPanel`
 * mounts `BlockCanvas` the same way the running app does, so this proves the
 * `/ nested page` row's effect end to end — not `PageLinkView` in isolation.
 * Steps 7–8 (new clears on open, trash/restore) are the pglite/unit tests in
 * the `openedAt` and rows-cache PLAN items, not re-asserted here.
 *
 * KAN-464 (user ruling 2026-10-24, following Notion over KAN-122): `/page`
 * and `/nested page` now OPEN the made page themselves — the link is still
 * left in the parent (asserted below), but the app navigates there at once
 * with the title focused, rather than leaving a row to click later.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { writeInTextBlock } from './helpers/text-block'

const mockRequestTitleFocus = jest.fn()
jest.mock('@/lib/pages/title-focus', () => ({
  requestTitleFocus: (...args: unknown[]) => mockRequestTitleFocus(...args),
  consumeTitleFocus: () => false,
}))

const mockPush = jest.fn()
let mockNodeId = 'page-1'
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
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

// The new page's own `getPage` read, independent of `createPage`'s mocked
// return — proves the opened page's title FIELD is blank, not just that the
// mock was told to say so.
const PAGES: Record<string, { id: string; title: string; blocks: Block[] }> = {
  'page-1': { id: 'page-1', title: 'kitchen renovation', blocks },
  'new-page': { id: 'new-page', title: '', blocks: [] },
}

let client: QueryClient

function tree() {
  return (
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function renderPanel() {
  mockGetPage.mockImplementation(async (...args: unknown[]) => PAGES[args[1] as string])
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(tree())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  mockFetchPages.mockResolvedValueOnce([PARENT_ROW]).mockImplementation(() => new Promise(() => {})) // the post-create refetch never resolves
  mockCreatePage.mockResolvedValue({ id: 'new-page', title: 'untitled', type: 'page' })
})

describe('`/ nested page` on the real page-hosting surface (KAN-122 path test)', () => {
  it('leaves a page-link row in the parent AND navigates to the new page with its title focused (KAN-464)', async () => {
    const { rerender } = renderPanel()

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
        // KAN-464: "untitled" is the premade template's stand-in name, never
        // meant to land in the title field — the made page's own title is blank.
        title: '',
        props: expect.objectContaining({ kind: 'nested page', nestedFrom: 'page-1' }),
      })
    )

    // The `/` line is gone, replaced by a page-link row at the same index —
    // the link is still left in the parent (KAN-122's own rule holds).
    expect(document.getElementById('block-b-slash')).not.toBeInTheDocument()

    const row = await screen.findByRole('button', { name: 'Open untitled' })
    const blockEls = [...document.querySelectorAll('[id^="block-"]')]
    expect(blockEls[1]).toContainElement(row)

    // `new` and `0 blocks` show at once off the optimistic insert — `fetchPages`
    // (mocked above) never returns the child's row at all.
    expect(await within(row).findByText('new')).toBeInTheDocument()
    expect(within(row).getByText('0 blocks')).toBeInTheDocument()
    expect(within(row).getByText('untitled')).toBeInTheDocument()

    // KAN-464 (superseding "stays on the parent"): the app opens the made
    // page itself, with its title focused — not just a link to click later.
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush.mock.calls[0][0]).toEqual(expect.stringContaining('nodeId=new-page'))
    expect(mockRequestTitleFocus).toHaveBeenCalledWith('new-page')

    // Follow the navigation to the made page itself: its title FIELD is blank
    // (its own `getPage` read, not `createPage`'s mocked return) — the "untitled"
    // above is only the page-link row's own empty-title fallback. The pending
    // shell paints first, straight off the optimistic row (still "untitled"),
    // so wait past it for the real, editable field `getPage` settles into.
    mockNodeId = 'new-page'
    rerender(tree())
    await waitFor(() => {
      const field = screen.getByLabelText('Page title')
      expect(field).not.toHaveAttribute('readonly')
      expect(field).toHaveValue('')
    })
  })
})
