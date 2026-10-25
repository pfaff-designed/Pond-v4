/**
 * KAN-471 PATH_STEPS: the person's whole path through the real `Rail` host
 * (not the isolated row) — empty pond, no hover, click the root row's ＋,
 * pick "page", land on the new page. Mirrors `rail-row-tools-path.test.tsx`'s
 * mount shape (KAN-314 item 4), trimmed to this ticket's concern.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { createPage } from '@/lib/pages/client'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-1', title: '' }),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

const ROWS: PageRow[] = []

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
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe('Rail — an empty pond, the person\'s whole path (KAN-471)', () => {
  it('no hover: click the root ＋, pick "page", land on the new page', async () => {
    const user = userEvent.setup()
    mount()

    const rootRow = screen.getByRole('treeitem', { name: 'life' })
    await user.click(within(rootRow).getByRole('button', { name: 'Add sub-page to life' }))
    await user.click(await screen.findByRole('menuitem', { name: /^page/ }))

    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ parentId: null })
    )
    expect(push).toHaveBeenCalledWith(expect.stringContaining('new-1'))
  })
})
