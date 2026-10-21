/**
 * The mount-time leftover sweep (KAN-300, Rail.tsx ~L1412) must trash a
 * leftover's whole LIVE subtree, the same as `handleDelete`/`commitDelete`
 * do for a delete started this session — `trash_page` itself trashes the
 * whole subtree regardless, so passing only the leftover's own id to
 * `trashPageUnlinked` left a descendant's own links as "page in trash"
 * after the sweep ran (KAN-448). See `rail-sweep-prior-life.test.tsx` for
 * the success path and file header.
 */
import { waitFor } from '@testing-library/react'
import { trashPageUnlinked } from '@/lib/pages/child-links'
import { mountRail, ROWS } from './helpers/rail-sweep-fixture'

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

it('passes a leftover root AND its cached child to the unlink-trash seam, not just the root', async () => {
  // `ROWS` (the fixture) parents 'db-1' under 'root-db' — exactly the
  // leftover id this sweep is trashing.
  sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['root-db']))

  mountRail(ROWS)

  await waitFor(() => expect(trashPageUnlinked).toHaveBeenCalledTimes(1))
  expect(trashPageUnlinked).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    pondId: 'pond-1',
    rootPageId: 'root-db',
    subtreeIds: new Set(['root-db', 'db-1']),
  })
})
