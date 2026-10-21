/**
 * KAN-393: on a cold reload `usePondId()` is `null` until `PondProvider`'s
 * `listPonds` resolves. The `pagesKey(null)` fallback query (`fetchPages`
 * resolves an unscoped caller to the person's first pond, #312) can land
 * first and let the ticket-25 ancestor reveal run against it. Treating the
 * later `null -> id` change as a pond switch wiped that reveal, and because
 * `revealedForRef` was already set, the reveal effect's once-per-selection
 * guard refused to run again — a deep link's ancestors stayed collapsed for
 * good. A `null -> id` landing must not count as a switch.
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
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'cabinets' : null) }),
}))

const AT = '2026-01-01T00:00:00Z'
const KITCHEN: PageRow = {
  id: 'kitchen',
  parent_id: null,
  type: 'page',
  title: 'Kitchen renovation',
  order: 0,
  updated_at: AT,
}
const CABINETS: PageRow = {
  id: 'cabinets',
  parent_id: 'kitchen',
  type: 'page',
  title: 'Cabinets',
  order: 0,
  updated_at: AT,
}
const ROWS = [KITCHEN, CABINETS]

const POND: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const UNRESOLVED_VALUE: PondContextValue = {
  pond: null,
  ponds: [],
  loading: true,
  reload: () => {},
  addPond: () => {},
}
const RESOLVED_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
}

describe('the rail keeps a cold-reload ancestor reveal across pondId resolving (KAN-393)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("stays expanded once the real pond id lands, after the null-pondId reveal ran first", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    // Both the unscoped fallback fetch and the real pond's fetch resolve to
    // the same rows, matching `fetchPages`'s own `resolvePond` fallback.
    client.setQueryData(pagesKey(null), ROWS)
    client.setQueryData(pagesKey('pond-1'), ROWS)

    const withPond = (value: PondContextValue) => (
      <QueryClientProvider client={client}>
        <PondContext.Provider value={value}>
          <DeletionUndoProvider>
            <Rail />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )

    const { rerender } = render(withPond(UNRESOLVED_VALUE))
    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()

    rerender(withPond(RESOLVED_VALUE))

    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
  })
})
