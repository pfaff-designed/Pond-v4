/**
 * KAN-415: the rail's ＋ on a row appends a page-link block to the created
 * page's parent, the same seam DocumentPanel's own-edit path uses — fired
 * after the page lands, never blocking it.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { appendChildLinkUnder } from '@/lib/pages/child-links'
import { mountRail } from './helpers/rail-sweep-fixture'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-page', title: '' }),
  deletePage: jest.fn().mockResolvedValue(undefined),
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

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

afterEach(() => jest.clearAllMocks())

it("a row's + appends a page-link block to that row's page, not the root", async () => {
  mountRail()

  await userEvent.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByText('new page in Health')
  await userEvent.click(screen.getByRole('menuitem', { name: /^page/ }))

  await waitFor(() => expect(appendChildLinkUnder).toHaveBeenCalledTimes(1))
  expect(appendChildLinkUnder).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'health',
    'new-page',
    'pond-1',
    'life'
  )
})
