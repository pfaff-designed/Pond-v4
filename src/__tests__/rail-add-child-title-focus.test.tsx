/**
 * KAN-464: a row's ＋ requests the made page's title be focused, the same
 * one-shot seam the ⌘K "new page" path and `/page` use (`title-focus.ts`) —
 * fired before `navigateTo`, so the editable `PageTitleRow` finds it already
 * waiting when it mounts.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createPage } from '@/lib/pages/client'
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

const mockRequestTitleFocus = jest.fn()
jest.mock('@/lib/pages/title-focus', () => ({
  requestTitleFocus: (...args: unknown[]) => mockRequestTitleFocus(...args),
}))

afterEach(() => jest.clearAllMocks())

it('a row\'s + requests title focus for the created page before navigating', async () => {
  mountRail()

  await userEvent.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByText('new page in Health')
  await userEvent.click(screen.getByRole('menuitem', { name: /^page/ }))

  expect(createPage).toHaveBeenCalledTimes(1)
  expect(mockRequestTitleFocus).toHaveBeenCalledWith('new-page')
})
