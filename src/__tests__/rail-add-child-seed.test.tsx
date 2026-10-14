/**
 * KAN-119: a new page's row `+` seeds no title and the premade `page`
 * template's one block, rather than `title: 'Untitled', blocks: []` — so
 * `title-eyebrow.ts`'s `isUntouchedPage` (and the hint line it draws) sees an
 * untouched page the instant it's made.
 */
import { screen, waitFor } from '@testing-library/react'
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

afterEach(() => jest.clearAllMocks())

it("a row's + opens the new-page menu, and \"page\" creates one with no title and one empty, hinted text block", async () => {
  mountRail()

  await userEvent.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByText('new page in Health')
  await userEvent.click(screen.getByRole('menuitem', { name: /^page/ }))

  expect(createPage).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    expect.objectContaining({
      title: '',
      blocks: [
        expect.objectContaining({
          type: 'text',
          content: '',
          placeholder: 'type, or / for blocks and templates',
        }),
      ],
    })
  )
})

it('Esc closes the new-page menu without creating anything', async () => {
  mountRail()

  await userEvent.click(screen.getByRole('button', { name: 'Add sub-page to Health' }))
  await screen.findByText('new page in Health')
  await userEvent.keyboard('{Escape}')

  await waitFor(() => expect(screen.queryByText('new page in Health')).not.toBeInTheDocument())
  expect(createPage).not.toHaveBeenCalled()
})
