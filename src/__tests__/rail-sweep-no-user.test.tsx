/**
 * The mount-time leftover sweep (KAN-300, Rail.tsx ~L1412) must not unstage
 * an id it never actually trashed. `withUser` can't tell "no signed-in user"
 * apart from "trash succeeded" (both resolve `undefined` for `trashPage`'s
 * `void` return) and was dropped for this reason — see
 * `rail-sweep-prior-life.test.tsx` for the success path and file header.
 */
import { screen } from '@testing-library/react'
import { isStaged } from '@/lib/deletion/staged-ids'
import { trashPage } from '@/lib/change-log/trash'
import { mountRail } from './helpers/rail-sweep-fixture'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'db-1' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
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

it('leaves a leftover id staged, and never calls trashPage, when nobody is signed in', async () => {
  sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['db-1']))

  mountRail()

  await screen.findByRole('tree', { name: 'Databases' })
  expect(trashPage).not.toHaveBeenCalled()
  expect(isStaged('db-1')).toBe(true)
})
