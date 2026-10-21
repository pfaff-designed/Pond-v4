/**
 * The mount-time leftover sweep (KAN-300, Rail.tsx ~L1412) ran against
 * `queryClient.getQueryData` alone, which is empty on a real cold reload —
 * the rail's own `pages` query hasn't resolved yet when this effect fires,
 * so the subtree fell back to the leftover id by itself and a descendant's
 * links were left as "page in trash" (KAN-448). `rail-sweep-subtree.test.tsx`
 * passes with the bug present because its fixture (`mountRail`) seeds the
 * cache directly; this file mounts with an EMPTY cache so the sweep must
 * await the real fetch instead.
 */
import { waitFor } from '@testing-library/react'
import { trashPageUnlinked } from '@/lib/pages/child-links'
import { fetchPages } from '@/lib/pages/tree'
import { mountRail, ROWS } from './helpers/rail-sweep-fixture'

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'root-db' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
  trashPageUnlinked: jest.fn().mockResolvedValue(undefined),
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

it('fetches the rows itself when the cache is empty, so a cold-reload sweep still finds the cached child', async () => {
  // `ROWS` (the fixture) parents 'db-1' under 'root-db' — exactly the
  // leftover id this sweep is trashing.
  ;(fetchPages as jest.Mock).mockResolvedValue(ROWS)
  sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['root-db']))

  mountRail(ROWS, false) // no seeded cache — the rail's own query has nothing yet either

  await waitFor(() => expect(trashPageUnlinked).toHaveBeenCalledTimes(1))
  expect(trashPageUnlinked).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    pondId: 'pond-1',
    rootPageId: 'root-db',
    subtreeIds: new Set(['root-db', 'db-1']),
  })
})
