/**
 * KAN-94/KAN-97 — the change log page's view bar (s6o1): six pills. "all" and
 * "deleted" are interactive; the rest are drawn but inert (aria-disabled, no
 * button role).
 */

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
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
  it('"all" and "deleted" have an accessible button role; the rest are inert', () => {
    renderPage()

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'deleted' })).toHaveAttribute('aria-pressed', 'false')

    for (const label of ['proposed', 'by page', 'memory', '＋ view']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
      const pill = screen.getByText(label)
      expect(pill).toHaveAttribute('aria-disabled', 'true')
    }
  })
})
