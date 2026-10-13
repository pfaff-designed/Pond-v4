/**
 * KAN-94 — the change log page's lead figure ("N proposed, waiting on you") is
 * wired to `countWaiting`, with a loading state before the count resolves.
 */

import { render, screen, waitFor } from '@testing-library/react'
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

const mockCountWaiting = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: (...args: unknown[]) => mockCountWaiting(...args),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('ChangeLogPage — the lead figure', () => {
  it('shows a loading state before the count resolves, then the faked count', async () => {
    let resolveCount: (n: number) => void = () => {}
    mockCountWaiting.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveCount = resolve
      })
    )

    renderPage()
    expect(screen.getByTestId('change-log-waiting-count')).toHaveTextContent('–')

    resolveCount(3)
    await waitFor(() =>
      expect(screen.getByTestId('change-log-waiting-count')).toHaveTextContent('3')
    )
  })

  it('passes the pond-scoped user to countWaiting', async () => {
    mockCountWaiting.mockResolvedValue(5)
    renderPage()
    await screen.findByText('5')
    expect(mockCountWaiting).toHaveBeenCalledWith(expect.anything(), 'user-1', 'pond-1')
  })
})
