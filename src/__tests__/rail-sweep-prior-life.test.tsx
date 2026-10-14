/**
 * The mount-time leftover sweep (KAN-300, Rail.tsx ~L1412) must only commit
 * ids left staged from BEFORE this script ever ran — a genuine prior tab
 * life, not an id staged during this same script execution (which still has
 * a live toast/undo path somewhere — see `rail-database-delete-path.test.tsx`
 * for that case, and `rail-sweep-edge-cases.test.tsx` for the no-user and
 * per-id-failure paths). `staged-ids`'s hydrate is lazy (on first function
 * call, not at import), so seeding `sessionStorage` before `Rail`'s first
 * render — the first thing in this file to touch it — is a real "fresh page
 * load", no `jest.resetModules()` needed.
 */
import { screen, within, waitFor } from '@testing-library/react'
import { isStaged } from '@/lib/deletion/staged-ids'
import { trashPage } from '@/lib/change-log/trash'
import { mountRail } from './helpers/rail-sweep-fixture'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'db-1' : null) }),
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

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn().mockResolvedValue(undefined),
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

it('commits a leftover id from sessionStorage exactly once, drops it from the rail cache, and unstages it', async () => {
  sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['db-1']))

  mountRail()

  await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(1))
  expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'db-1')
  await waitFor(() => expect(isStaged('db-1')).toBe(false))
  await waitFor(() =>
    expect(
      within(screen.getByRole('tree', { name: 'Databases' })).queryByRole('treeitem', {
        name: 'ingredients',
      })
    ).not.toBeInTheDocument()
  )
})
