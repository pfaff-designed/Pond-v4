/**
 * The mount-time leftover sweep (KAN-300, Rail.tsx ~L1412) must unstage an id
 * whose `trashPage` refuses 'not-found' — a pagehide flush already trashed it
 * before this sweep ran, so there is nothing left to retry. Leaving it staged
 * would hide a later restore (from the change log) as still-staged and
 * re-trash it on the NEXT reload — see `rail-sweep-partial-failure.test.tsx`
 * for the case that should still leave an id staged (a genuine, retryable
 * failure), and `rail-sweep-prior-life.test.tsx` for the success path and
 * file header.
 */
import { waitFor } from '@testing-library/react'
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

jest.mock('@/lib/change-log/trash', () => {
  const { TrashRefusedError: ActualTrashRefusedError } = jest.requireActual(
    '@/lib/change-log/errors'
  )
  return {
    trashPage: jest
      .fn()
      .mockRejectedValue(new ActualTrashRefusedError('not-found', 'page not found')),
  }
})

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

it('unstages a leftover id whose trashPage refuses not-found, instead of leaving it staged forever', async () => {
  sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['db-1']))

  mountRail()

  await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(isStaged('db-1')).toBe(false))
})
