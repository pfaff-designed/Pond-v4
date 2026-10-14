/**
 * KAN-175 — PATH_STEPS end to end: a person opens the floating "changes to
 * this page" panel with ⌥⌘H, sees the board's rows (a real label per record,
 * a pill only on the row still waiting on a decision), opens a row's record,
 * and opens the change log filtered to the page from the panel's foot link.
 * Separately pins that the change log page, given that same URL, renders the
 * filtered list behind the "page is {title}" chip. Also covers PATH_STEPS 7
 * (an empty page).
 *
 * Mounts the smallest real host that wires `usePageChangesPanel` — the same
 * `Host` pattern `page-changes-panel-non-mac-shortcut.test.tsx` already uses
 * — rather than the full `DocumentPanel`, which pulls in the editor and every
 * other organism it hosts for no benefit to this path.
 */

import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageChangesPanel } from '@/components/organisms/PageChangesPanel'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { changeLogPageFilterUrl, changeLogRecordUrl } from '@/lib/change-log/record-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const PAGE_ID = 'page-1'
const EMPTY_PAGE_ID = 'page-empty'
const PAGE_TITLE = 'kitchen renovation'

const mockPush = jest.fn()
let searchParamsPageId: string | null = null

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/pond/name', () => ({
  usePondName: () => 'life',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'page' ? searchParamsPageId : null),
  }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}))

const mockGetPage = jest.fn()
const mockListPages = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

const mockListRecords = jest.fn()
const mockCountWaiting = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  countWaiting: (...args: unknown[]) => mockCountWaiting(...args),
}))

function record(over: Partial<ChangeLogRecord> & Pick<ChangeLogRecord, 'id'>): ChangeLogRecord {
  return {
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'you',
    targetPageId: PAGE_ID,
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-10-01T09:31:00.000Z',
    statusAt: '2026-10-01T09:31:00.000Z',
    ...over,
  }
}

// "accepted edit" — recordTitle reads this as "alpha one → apple one"
// (board s6o8's own example), same as `change-log-record-page.test.ts`.
const ACCEPTED_EDIT = record({
  id: 'rec-accepted',
  action: 'edit',
  status: 'accepted',
  before: [{ id: 'b1', type: 'text', content: 'alpha one' }],
  after: [{ id: 'b1', type: 'text', content: 'apple one' }],
})

// "outdated revert" — still waiting on a decision (WAITING_STATUSES), so its
// row is the only one drawn as a pill.
const OUTDATED_REVERT = record({
  id: 'rec-outdated',
  action: 'revert',
  status: 'outdated',
  before: [{ id: 'b2', type: 'text', content: 'apple one' }],
  after: [{ id: 'b2', type: 'text', content: 'apricot one' }],
})

// "no-answer-needed" — settled, no block snapshot, so `recordTitle` falls
// back to `describeChange`'s plain label.
const NO_ANSWER_NEEDED = record({
  id: 'rec-no-answer',
  action: 'create_page',
  status: 'accepted',
})

const PAGE_1_RECORDS = [ACCEPTED_EDIT, OUTDATED_REVERT, NO_ANSWER_NEEDED]

function Host({ pageId }: { pageId: string }) {
  const { overlay } = usePageChangesPanel(pageId)
  return overlay
}

function renderHost(pageId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Host pageId={pageId} />
    </QueryClientProvider>
  )
}

function renderChangeLogPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

// The Mac chord — `isApplePlatform()` reads `navigator.platform` directly, so
// it's pinned explicitly rather than assumed from the test host's own OS.
const altMetaH = { key: 'h', altKey: true, metaKey: true, code: 'KeyH' }
const platform = jest.spyOn(window.navigator, 'platform', 'get')

beforeEach(() => {
  jest.clearAllMocks()
  platform.mockReturnValue('MacIntel')
  searchParamsPageId = null
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => ({
    id,
    parentId: null,
    type: 'page',
    title: id === PAGE_ID ? PAGE_TITLE : 'empty page',
    blocks: [],
    props: {},
    order: 0,
  }))
  mockListPages.mockResolvedValue([{ id: PAGE_ID, title: PAGE_TITLE }])
  mockCountWaiting.mockResolvedValue(0)
  mockListRecords.mockImplementation(async (_supabase: unknown, opts: { targetPageId?: string }) => {
    if (opts.targetPageId === PAGE_ID) return PAGE_1_RECORDS
    if (opts.targetPageId === EMPTY_PAGE_ID) return []
    return []
  })
})

describe('KAN-175 path — the page-changes panel and open-in-change-log', () => {
  it('shows real rows with a pill only on the outdated one, opens a record, and opens the filtered change log', async () => {
    renderHost(PAGE_ID)

    expect(screen.queryByRole('complementary', { name: 'Changes to this page' })).toBeNull()
    fireEvent.keyDown(document, altMetaH)
    await screen.findByRole('complementary', { name: 'Changes to this page' })

    const acceptedRow = await screen.findByRole('button', { name: /alpha one → apple one/ })
    const outdatedRow = screen.getByRole('button', { name: /apple one → apricot one/ })
    const noAnswerRow = screen.getByRole('button', { name: /created this page/ })

    expect(within(outdatedRow).getByText('outdated').className).toContain('rounded-full')
    expect(within(acceptedRow).getByText('accepted').className).not.toContain('rounded-full')
    expect(within(noAnswerRow).getByText('accepted').className).not.toContain('rounded-full')

    await userEvent.click(acceptedRow)
    expect(mockPush).toHaveBeenCalledWith(changeLogRecordUrl(ACCEPTED_EDIT.id))

    // Reopen (close, then open again) before following the foot link.
    fireEvent.keyDown(document, altMetaH)
    expect(screen.queryByRole('complementary', { name: 'Changes to this page' })).toBeNull()
    fireEvent.keyDown(document, altMetaH)
    await screen.findByRole('complementary', { name: 'Changes to this page' })

    await userEvent.click(await screen.findByRole('button', { name: 'open in change log' }))
    expect(mockPush).toHaveBeenCalledWith(changeLogPageFilterUrl(PAGE_ID))
  })

  it('no changes to this page yet — the empty state', async () => {
    renderHost(EMPTY_PAGE_ID)

    fireEvent.keyDown(document, altMetaH)
    expect(await screen.findByText('no changes to this page yet')).toBeInTheDocument()
  })
})

describe('KAN-175 path — the change log, given the panel’s own URL', () => {
  it('renders the chip and only this page’s own records, same query as the panel', async () => {
    searchParamsPageId = PAGE_ID
    renderChangeLogPage()

    expect(await screen.findByText(`page is ${PAGE_TITLE}`)).toBeInTheDocument()
    expect(screen.getByTestId(`change-log-status-${ACCEPTED_EDIT.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`change-log-status-${OUTDATED_REVERT.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`change-log-status-${NO_ANSWER_NEEDED.id}`)).toBeInTheDocument()
    expect(mockListRecords).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetPageId: PAGE_ID })
    )
  })
})
