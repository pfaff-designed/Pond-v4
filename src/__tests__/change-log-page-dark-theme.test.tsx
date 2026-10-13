/**
 * KAN-94 — `ChangeLogPage` under the `.dark` role tokens a sibling surface
 * already uses (ground #1B1D14, cards #30312A). The page draws only through
 * `mn-*` role classes (`globals.css`'s `.dark` block redefines them, not the
 * component), so a `.dark` render must carry zero literal hex and the same
 * token classes as light.
 */

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(3),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

const mockListRecords = jest.fn()
const mockListPages = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'proposed',
    action: 'create_page',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

/** A full `#RRGGBB` or `#RRGGBBAA` colour literal, same scope as the token-law sweep. */
const HEX_COLOUR = /#[0-9a-fA-F]{6}\b([0-9a-fA-F]{2})?/

function renderUnderDark() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <div className="dark">
      <QueryClientProvider client={client}>
        <ChangeLogPage />
      </QueryClientProvider>
    </div>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockListRecords.mockResolvedValue([record()])
  mockListPages.mockResolvedValue([{ id: 'page-1', title: 'kitchen renovation' }])
})

describe('ChangeLogPage — dark theme', () => {
  it('renders no literal hex anywhere in the page under .dark', async () => {
    const { container } = renderUnderDark()
    await screen.findByText('created this page')

    expect(HEX_COLOUR.test(container.innerHTML)).toBe(false)
  })

  it('reads ground/card/text through the same mn-* role classes as light — no dark: variant, no new token', async () => {
    const { container } = renderUnderDark()
    await screen.findByText('created this page')

    const card = container.querySelector('.rounded-mn-card')
    expect(card).not.toBeNull()
    expect(card).toHaveClass('bg-mn-card')

    const title = screen.getByText('change log')
    expect(title).toHaveClass('text-mn-text')

    const statusPill = screen.getByTestId('change-log-status-rec-1')
    expect(statusPill).toHaveClass('text-mn-text', 'ring-mn-mark-faint')

    // The role tokens carry the theme; the component itself declares no
    // `dark:` escape hatch and no second colour path.
    expect(container.innerHTML).not.toMatch(/\bdark:/)
  })
})
