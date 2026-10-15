/**
 * KAN-94/KAN-97/KAN-96/KAN-322 — the change log page's view bar (s6o1): six
 * pills on the shared view-tabs engine. "all", "proposed" and "deleted" are
 * tabs (role=tab, aria-selected, roving ←/→ focus); "by page" and "memory"
 * are drawn but inert (aria-hidden, no tab role, skipped by arrow nav, kept out of ViewTabsList's
 * required tab/tabpanel children); "＋ view" stays outside the tablist as a plain aria-disabled span.
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
  it('"all", "proposed" and "deleted" have an accessible tab role; the rest are inert', () => {
    renderPage()

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'all' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'deleted' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'all' })).toHaveClass('focus-visible:outline-mn-area-b')

    for (const label of ['by page', 'memory']) {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument()
      const pill = screen.getByText(label)
      expect(pill).toHaveAttribute('aria-hidden', 'true')
    }

    expect(screen.queryByRole('tab', { name: '＋ view' })).not.toBeInTheDocument()
    expect(screen.getByText('＋ view')).toHaveAttribute('aria-disabled', 'true')
  })

  it('clicking "proposed" switches the active tab', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'proposed' }))

    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'all' })).toHaveAttribute('aria-selected', 'false')
  })

  it('→ from "proposed" skips the inert views and lands on "deleted"; ← returns to "proposed"', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'proposed' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'deleted' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'deleted' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'proposed' })).toHaveAttribute('aria-selected', 'true')
  })
})
