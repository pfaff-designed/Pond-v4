/**
 * The mount-time leftover sweep (KAN-300, Rail.tsx ~L1412) must catch a
 * failing `deletePage` per id rather than letting one rejection abort the
 * whole loop (or go unhandled) — see `rail-sweep-prior-life.test.tsx` for the
 * success path and file header.
 */
import { waitFor } from '@testing-library/react'
import { isStaged } from '@/lib/deletion/staged-ids'
import { deletePage } from '@/lib/pages/client'
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
  deletePage: jest
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(undefined),
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

it('catches a failing delete per id: a second leftover id still commits', async () => {
  sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['db-1', 'root-db']))

  mountRail()

  await waitFor(() => expect(deletePage).toHaveBeenCalledTimes(2))
  expect(isStaged('db-1')).toBe(true)
  await waitFor(() => expect(isStaged('root-db')).toBe(false))
})
