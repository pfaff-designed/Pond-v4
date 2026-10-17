/**
 * KAN-94/KAN-97/KAN-96/KAN-322/KAN-148 — the change log page's view bar
 * (s6o1): four real pills on the shared view-tabs engine — "all",
 * "proposed", "by page" and "deleted" (role=tab, aria-selected, roving ←/→
 * focus). "memory" stays absent until KAN-173 lands (no inert span drawn for
 * it). "＋ view" stays outside the tablist as a plain aria-disabled span
 * until KAN-148's later items wire it up.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/name', () => ({
  usePondName: () => 'life',
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(0),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

describe('ChangeLogPage — the view bar', () => {
  it('"all", "proposed", "by page" and "deleted" are real tabs; no inert spans', () => {
    renderPage()

    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByRole('tab', { name: 'all' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'by page' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'deleted' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'all' })).toHaveClass('focus-visible:outline-mn-area-b')

    expect(screen.queryByText('memory')).not.toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: '＋ view' })).not.toBeInTheDocument()
    expect(screen.getByText('＋ view')).toHaveAttribute('aria-disabled', 'true')
  })

  it('clicking "by page" switches the active tab', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))

    expect(screen.getByRole('tab', { name: 'by page' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'all' })).toHaveAttribute('aria-selected', 'false')
  })

  it('→ roves all/proposed/by page/deleted in order; ← returns', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'all' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'by page' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'by page' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'deleted' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'deleted' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'by page' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'by page' })).toHaveAttribute('aria-selected', 'true')
  })
})
