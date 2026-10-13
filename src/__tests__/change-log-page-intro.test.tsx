/**
 * KAN-94 — s6o1's second child is a lead paragraph, verbatim per the board
 * (`Pond 06.15 Change log.dc.html`, frame `s6o1 the log`).
 */

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

describe('ChangeLogPage — the lead paragraph', () => {
  it('renders the board copy verbatim', () => {
    renderPage()
    expect(
      screen.getByText(
        'Every action in this pond, by you, by Pond and by anyone you share a page with. One record for each, newest first.'
      )
    ).toBeInTheDocument()
  })
})
