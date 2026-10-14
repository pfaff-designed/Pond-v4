/**
 * KAN-303 path test — the surface a person actually uses, not a unit test of
 * one function. Two independent `PageChangesPanel` mounts (two "tabs"), each
 * with its OWN `QueryClient` (a real tab's own cache), talk to ONE shared fake
 * server (one `change_log` row, one page) through a shared fake Supabase client
 * and a `listRecords`/`markOutdated` store mock — so settling the row for real
 * in tab A is what makes tab B's identical click a genuine stale-click race,
 * not a mocked rejection.
 *
 * Covers:
 *   - item 1 (`markRevertOutdated`'s `IllegalTransitionError` catch, reached
 *     through `onAccept` → `acceptRevert` on a revert record)
 *   - item 2 (`run()`'s own `IllegalTransitionError` catch, reached through
 *     `onReject`'s direct `advanceStatus` call)
 *   - item 4 (reopening — unmount/remount, never a reload or fake timers —
 *     shows the status the other tab set)
 */

import { render, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageChangesPanel } from '@/components/organisms/PageChangesPanel'
import type { ChangeLogRow } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

const mockListRecords = jest.fn()
const mockMarkOutdated = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  // Not under test here — the proposed-rows sweep that already-accepted path
  // triggers. Stubbed, same as the lower-level `acceptRevert` tests do.
  markOutdated: (...args: unknown[]) => mockMarkOutdated(...args),
}))

/**
 * One `change_log` row and one page's blocks, mutated only through the same
 * two surfaces the real server exposes: a row lookup by id, and the two RPCs
 * `advanceStatus`/`acceptRevert` actually call. Both tabs' Supabase clients
 * read and write this same state, so a write made through tab A's client is
 * visible to a call made through tab B's.
 */
function makeSharedServer(initialRow: ChangeLogRow, initialPageBlocks: unknown) {
  let row: ChangeLogRow = { ...initialRow }
  let pageBlocks: unknown = initialPageBlocks

  function client() {
    return {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        if (table !== 'change_log') throw new Error(`unexpected table ${table}`)
        let targetId: string | null = null
        const builder = {
          select: () => builder,
          eq: (col: string, val: string) => {
            if (col === 'id') targetId = val
            return builder
          },
          maybeSingle: () => Promise.resolve({ data: targetId === row.id ? row : null, error: null }),
        }
        return builder
      },
      rpc: (fn: string, args: Record<string, unknown>) => {
        const now = new Date().toISOString()
        if (fn === 'advance_change_log_record') {
          row = {
            ...row,
            status: args.p_to as string,
            status_at: now,
          }
          return Promise.resolve({ data: row, error: null })
        }
        if (fn === 'accept_revert_record') {
          pageBlocks = args.p_blocks
          row = { ...row, status: 'accepted', status_at: now }
          return Promise.resolve({ data: row, error: null })
        }
        return Promise.resolve({ data: null, error: { message: `unhandled rpc ${fn}` } })
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  return {
    client,
    getRow: () => row,
    getPageBlocks: () => pageBlocks,
  }
}

let currentServer: ReturnType<typeof makeSharedServer>

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => currentServer.client(),
}))

const PAGE_ID = 'page-1'

function baseRow(over: Partial<ChangeLogRow> = {}): ChangeLogRow {
  return {
    id: 'revert-1',
    user_id: 'user-1',
    pond_id: 'pond-1',
    status: 'proposed',
    action: 'revert',
    actor: 'you',
    target_page_id: PAGE_ID,
    target_block_id: null,
    before: [],
    after: [],
    source_thread_id: null,
    tool_call_id: null,
    read: null,
    links: {},
    transitions: [],
    created_at: '2026-10-01T09:31:00.000Z',
    status_at: '2026-10-01T09:31:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMarkOutdated.mockResolvedValue([])
  mockGetPage.mockImplementation(async () => ({
    id: PAGE_ID,
    parentId: null,
    type: 'page',
    title: 'Page 1',
    blocks: currentServer.getPageBlocks(),
    props: {},
    order: 0,
  }))
  mockListRecords.mockImplementation(async () => {
    const actual = jest.requireActual('@/lib/change-log/store')
    return [actual.mapChangeLogRow(currentServer.getRow())]
  })
})

afterEach(() => {
  cleanup()
})

/** One tab: its own cache, same shared server underneath. */
function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PageChangesPanel pageId={PAGE_ID} />
    </QueryClientProvider>
  )
  return { queryClient, ...utils }
}

/** ⌥⌘H twice: close (unmount) this tab's panel, then reopen (remount) it — in
 *  the SAME tab, so it keeps its own `QueryClient` and cache. */
function reopenTab(tab: ReturnType<typeof renderTab>) {
  tab.unmount()
  return render(
    <QueryClientProvider client={tab.queryClient}>
      <PageChangesPanel pageId={PAGE_ID} />
    </QueryClientProvider>
  )
}

describe('a stale click in a second tab, at the surface a person uses', () => {
  it('a stale reject answers at once (item 2), and reopening shows the status tab A set (item 4)', async () => {
    currentServer = makeSharedServer(baseRow(), [])
    const user = userEvent.setup()

    const tabA = renderTab()
    const tabB = renderTab()

    const rejectA = await within(tabA.container).findByRole('button', { name: 'reject' })
    await user.click(rejectA)
    // The real settle — tab A's own view now reads it back as rejected.
    await within(tabA.container).findByText('rejected')

    // Tab B never refetched: its row is still the pre-settle `proposed` one.
    const rejectB = await within(tabB.container).findByRole('button', { name: 'reject' })
    await user.click(rejectB)

    const alert = await within(tabB.container).findByRole('alert')
    expect(alert).toHaveTextContent('this change was already answered')
    expect(alert.textContent).not.toMatch(/change log:/)

    const reopened = reopenTab(tabB)
    expect(await within(reopened.container).findByText('rejected')).toBeInTheDocument()
  })

  it('a stale revert-accept settles as outdated (item 1), and reopening shows the status tab A set (item 4)', async () => {
    const blockBefore = { id: 'a', type: 'text', content: 'original' }
    const blockAfter = { id: 'a', type: 'text', content: 'reverted' }
    currentServer = makeSharedServer(baseRow({ before: [blockBefore], after: [blockAfter] }), [
      blockBefore,
    ])
    const user = userEvent.setup()

    const tabA = renderTab()
    const tabB = renderTab()

    const acceptA = await within(tabA.container).findByRole('button', { name: 'accept' })
    await user.click(acceptA)
    // The real settle — the page is now written and the row reads back accepted.
    await within(tabA.container).findByText('accepted')

    // Tab B never refetched: its row is still the pre-settle `proposed` one, so
    // it still offers accept/reject on a revert the page has already moved past.
    const acceptB = await within(tabB.container).findByRole('button', { name: 'accept' })
    await user.click(acceptB)

    const alert = await within(tabB.container).findByRole('alert')
    expect(alert).toHaveTextContent('this page changed since — revert the change again')
    expect(alert.textContent).not.toMatch(/change log:/)

    const reopened = reopenTab(tabB)
    expect(await within(reopened.container).findByText('accepted')).toBeInTheDocument()
  })
})
