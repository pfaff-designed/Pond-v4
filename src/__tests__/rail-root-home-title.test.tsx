/**
 * KAN-490: the rail's root row (the synthetic Life row) is labelled with the
 * HOME ROW's own title — the data model point that the home row IS the first
 * root — not the pond's name. Renders the real `Rail` container so the label
 * comes from the wired-up `useHomePage` hook, not a prop handed in directly.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
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

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Untitled', blocks: [] }),
}))

const ROWS: PageRow[] = []

const POND: Pond = {
  id: 'pond-1',
  name: 'Studio',
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
  patchPond: () => {},
  removePond: () => {},
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

test('the root row reads the home row title, not the pond name', async () => {
  mount()

  expect(await screen.findByRole('treeitem', { name: /Untitled/ })).toBeInTheDocument()
  expect(screen.queryByRole('treeitem', { name: /Studio/ })).not.toBeInTheDocument()
})
