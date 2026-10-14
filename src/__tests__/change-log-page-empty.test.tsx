/**
 * KAN-94 — the change log page's empty state (AUDIT G6): a pond with no
 * records shows copy in the register of `PageChangesSection`'s own empty
 * line, not an empty table shell.
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
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

const mockListRecords = jest.fn()
const mockListPages = jest.fn()

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockListRecords.mockResolvedValue([])
  mockListPages.mockResolvedValue([])
})

describe('ChangeLogPage — empty state', () => {
  it('does not show the empty copy while the first records page is still loading', () => {
    renderPage()

    expect(screen.queryByTestId('change-log-empty')).not.toBeInTheDocument()
  })

  it('shows the empty copy and no header/day-group rows once the records query resolves to none', async () => {
    renderPage()

    await screen.findByTestId('change-log-empty')

    expect(screen.queryByText('time')).not.toBeInTheDocument()
    expect(screen.queryByText('what')).not.toBeInTheDocument()
    expect(screen.queryByText('page')).not.toBeInTheDocument()
    expect(screen.queryByText('by')).not.toBeInTheDocument()
    expect(screen.queryByText('status')).not.toBeInTheDocument()
  })
})
