/**
 * KAN-248 fix (Rail.tsx:1507 `handlePickGlyph`): a glyph pick is "one change,
 * one undoable record" (the 10 oct ruling) — the record is written here so
 * KAN-93's ⌘Z chord has something to replay. Proves the real container
 * (`Rail`, not `RailView` plus a harness) writes exactly one `appendOwnEdit`
 * record per pick, carrying the before and after glyph, including a pick of
 * `automatic` (glyph `null`), which is a change too.
 */
import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

const mockSetPageGlyph = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: (...args: unknown[]) => mockSetPageGlyph(...args),
}))

const mockPushRecentGlyphToPond = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: (...args: unknown[]) => mockPushRecentGlyphToPond(...args),
}))

const mockAppendOwnEdit = jest.fn().mockResolvedValue({})
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  {
    id: 'health',
    parent_id: null,
    type: 'page',
    title: 'Health',
    order: 0,
    updated_at: AT,
    glyph: 'heart',
  },
]

const POND: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), ROWS)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockSetPageGlyph.mockClear()
  mockAppendOwnEdit.mockClear()
  mockPushRecentGlyphToPond.mockClear()
})

describe('handlePickGlyph — a failed recent-glyph push', () => {
  it('rolls back the optimistic recent entry instead of leaving an unhandled rejection', async () => {
    mockPushRecentGlyphToPond.mockRejectedValueOnce(new Error('nope'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    mount()
    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const cell = (await within(document.body).findAllByRole('gridcell'))[0]
    await userEvent.click(cell)

    await waitFor(() => expect(mockPushRecentGlyphToPond).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[recent-glyphs] push not persisted',
        expect.anything(),
        expect.anything()
      )
    )

    // Reopen: the rolled-back pick never shows up as a `recent` entry.
    await userEvent.click(mark)
    expect(within(document.body).queryByText('recent')).not.toBeInTheDocument()
    consoleError.mockRestore()
  })
})

describe('handlePickGlyph — the change-log record', () => {
  it('appends exactly one own-edit record with the before and after glyph', async () => {
    mount()
    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const cell = (await within(document.body).findAllByRole('gridcell'))[0]
    const picked = cell.getAttribute('aria-label')

    await userEvent.click(cell)

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(mockSetPageGlyph).toHaveBeenCalledWith(expect.anything(), 'health', picked)
    expect(mockAppendOwnEdit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        pondId: 'pond-1',
        action: 'edit_glyph',
        targetPageId: 'health',
        before: 'heart',
        after: picked,
      })
    )
  })

  it('logs a pick of automatic (glyph null) too — it is a change as well', async () => {
    mount()
    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const automatic = await within(document.body).findByText('automatic')
    await userEvent.click(automatic)

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(mockSetPageGlyph).toHaveBeenCalledWith(expect.anything(), 'health', null)
    expect(mockAppendOwnEdit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetPageId: 'health',
        action: 'edit_glyph',
        before: 'heart',
        after: null,
      })
    )
  })

  it('appends nothing for a no-op pick, while the page still ends with the right glyph', async () => {
    mount()
    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const heart = within(document.body).getByRole('gridcell', { name: 'heart' })
    await userEvent.click(heart)

    await waitFor(() => expect(mockSetPageGlyph).toHaveBeenCalledWith(expect.anything(), 'health', 'heart'))
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })
})
