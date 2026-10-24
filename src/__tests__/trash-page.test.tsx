/**
 * KAN-451 — `TrashPage` wired to real data: `buildTrashRows` over a
 * keyset-paginated `delete`/`restore` read, the lead line's singular/plural,
 * the empty state, and "load more" showing only while a next page exists.
 * Restore itself lands in the next item.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrashPage } from '@/components/organisms/TrashPage'
import { TrashRefusedError } from '@/lib/change-log/errors'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'

/** `NODE_ENV` is typed read-only (`@types/node`); this is the one deliberate
 *  exception, matching `change-log-trash-view.test.ts`'s own helper — needed
 *  to exercise the production fallback `purgeDay` takes for an unreadable
 *  `createdAt` (KAN-551), since jest itself runs with `NODE_ENV=test`. */
const setNodeEnv = (value: string | undefined): void => {
  (process.env as { NODE_ENV: string | undefined }).NODE_ENV = value
}

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

const mockListRecords = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

const mockExistingPageIds = jest.fn()
jest.mock('@/lib/change-log/trash', () => ({
  ...jest.requireActual('@/lib/change-log/trash'),
  existingPageIds: (...args: unknown[]) => mockExistingPageIds(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: jest.fn().mockResolvedValue([]),
}))

const mockRestorePageRelinked = jest.fn()
jest.mock('@/lib/pages/child-links', () => ({
  restorePageRelinked: (...args: unknown[]) => mockRestorePageRelinked(...args),
}))

const snapshot = (over: Partial<TrashSnapshot> = {}): TrashSnapshot => ({
  title: 'old quotes',
  parentId: null,
  order: 0,
  pageIds: ['page-1'],
  blockCount: 4,
  nestedPageCount: 0,
  parentPath: [],
  ...over,
})

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'delete',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: snapshot(),
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-26T12:00:00.000Z',
    statusAt: '2026-09-26T12:00:00.000Z',
    ...over,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TrashPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockExistingPageIds.mockImplementation(async (_supabase, ids: string[]) => new Set(ids))
  mockRestorePageRelinked.mockResolvedValue(undefined)
})

describe('TrashPage', () => {
  it('renders one row per trashed page', async () => {
    mockListRecords.mockResolvedValue([
      record({ id: 'del-1', targetPageId: 'page-1', before: snapshot({ title: 'old quotes' }) }),
      record({ id: 'del-2', targetPageId: 'page-2', before: snapshot({ title: 'supplier list' }) }),
    ])

    renderPage()

    expect(await screen.findAllByTestId('trash-row')).toHaveLength(2)
    expect(screen.getByText('old quotes')).toBeInTheDocument()
    expect(screen.getByText('supplier list')).toBeInTheDocument()
  })

  it('lists a bad-date row with its page and restore control and an empty goes cell, while other rows still show their countdown (KAN-551)', async () => {
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV
    setNodeEnv('production')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockListRecords.mockResolvedValue([
        record({
          id: 'del-1',
          targetPageId: 'page-1',
          before: snapshot({ title: 'old quotes' }),
          createdAt: 'not-a-date',
        }),
        record({ id: 'del-2', targetPageId: 'page-2', before: snapshot({ title: 'supplier list' }) }),
      ])

      renderPage()

      const rows = await screen.findAllByTestId('trash-row')
      expect(rows).toHaveLength(2)

      const badRow = within(rows[0])
      expect(badRow.getByText('old quotes')).toBeInTheDocument()
      expect(badRow.getByRole('button', { name: 'restore' })).toBeInTheDocument()
      expect(badRow.queryByText(/^(today|in \d+ days?)$/)).not.toBeInTheDocument()

      const goodRow = within(rows[1])
      expect(goodRow.getByText('supplier list')).toBeInTheDocument()
      expect(goodRow.getByText(/^(today|in \d+ days?)$/)).toBeInTheDocument()

      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      setNodeEnv(ORIGINAL_NODE_ENV)
    }
  })

  it('reads the lead line singular for one page, plural for more than one', async () => {
    mockListRecords.mockResolvedValue([record()])
    renderPage()

    expect(await screen.findByText("1 page in trash · each goes 30 days after it's deleted")).toBeInTheDocument()

    mockListRecords.mockResolvedValue([
      record({ id: 'del-1', targetPageId: 'page-1' }),
      record({ id: 'del-2', targetPageId: 'page-2' }),
    ])
    renderPage()

    expect(
      await screen.findByText("2 pages in trash · each goes 30 days after it's deleted")
    ).toBeInTheDocument()
  })

  it('says so plainly when nothing has been trashed, with no lead line', async () => {
    mockListRecords.mockResolvedValue([])
    renderPage()

    expect(await screen.findByTestId('trash-empty')).toHaveTextContent('trash is empty')
    expect(screen.queryByText(/pages? in trash/)).not.toBeInTheDocument()
  })

  it('fetches every record page so a still-trashed page past 60 newer delete/restore pairs is listed', async () => {
    // 60 pairs (restore newer than its own delete), newest first, then one
    // still-trashed delete older than all of them — three keyset pages of
    // listRecords (50 + 50 + 21) must all be fetched for this row to appear.
    const at = (i: number) => new Date(2026, 8, 26, 12, 0, -i).toISOString()
    const pairs: ChangeLogRecord[] = Array.from({ length: 60 }, (_, i) => [
      record({ id: `restore-${i}`, action: 'restore', targetPageId: `pair-${i}`, createdAt: at(2 * i) }),
      record({ id: `del-${i}`, targetPageId: `pair-${i}`, createdAt: at(2 * i + 1) }),
    ]).flat()
    const remaining = record({
      id: 'del-remaining',
      targetPageId: 'page-remaining',
      before: snapshot({ title: 'old quotes' }),
      createdAt: at(120),
    })
    const all = [...pairs, remaining]
    mockListRecords.mockImplementation(async (_supabase, opts: { before?: string; limit: number }) => {
      const pool = opts.before
        ? all.filter((r) => Date.parse(r.createdAt) < Date.parse(opts.before!))
        : all
      return pool.slice(0, opts.limit)
    })

    renderPage()

    expect(await screen.findAllByTestId('trash-row')).toHaveLength(1)
    expect(screen.getByText('old quotes')).toBeInTheDocument()
    expect(
      await screen.findByText("1 page in trash · each goes 30 days after it's deleted")
    ).toBeInTheDocument()
  })

  it('paginates the derived rows, not the records, and counts every one in the lead line', async () => {
    const stillTrashed: ChangeLogRecord[] = Array.from({ length: 120 }, (_, i) =>
      record({
        id: `del-${i}`,
        targetPageId: `page-${i}`,
        before: snapshot({ title: `page ${i}` }),
        createdAt: new Date(2026, 8, 26, 12, 0, -i).toISOString(),
      })
    )
    mockListRecords.mockImplementation(async (_supabase, opts: { before?: string; limit: number }) => {
      const pool = opts.before
        ? stillTrashed.filter((r) => Date.parse(r.createdAt) < Date.parse(opts.before!))
        : stillTrashed
      return pool.slice(0, opts.limit)
    })

    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByText("120 pages in trash · each goes 30 days after it's deleted")
    ).toBeInTheDocument()
    expect(await screen.findAllByTestId('trash-row')).toHaveLength(50)
    expect(screen.getByTestId('trash-load-more')).toBeInTheDocument()

    await user.click(screen.getByTestId('trash-load-more'))

    expect(await screen.findAllByTestId('trash-row')).toHaveLength(100)
  })

  it('restores through restorePageRelinked and removes the row from the table', async () => {
    let answered = false
    mockListRecords.mockImplementation(async () =>
      answered
        ? [record(), record({ id: 'restore-1', action: 'restore', createdAt: '2026-09-27T12:00:00.000Z' })]
        : [record()]
    )
    mockRestorePageRelinked.mockImplementation(async () => {
      answered = true
    })

    const user = userEvent.setup()
    renderPage()

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    expect(mockRestorePageRelinked).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      pondId: 'pond-1',
      recordId: 'rec-1',
      rootPageId: 'page-1',
    })
    await waitFor(() => {
      expect(screen.queryByTestId('trash-row')).not.toBeInTheDocument()
    })
    expect(await screen.findByTestId('trash-empty')).toBeInTheDocument()
  })

  it('says so, as a notice, when the restore fell back to the pond root', async () => {
    let answered = false
    mockListRecords.mockImplementation(async () =>
      answered
        ? [
            record(),
            record({
              id: 'restore-1',
              action: 'restore',
              createdAt: '2026-09-27T12:00:00.000Z',
              after: { parentFallback: true },
            }),
          ]
        : [record()]
    )
    mockRestorePageRelinked.mockImplementation(async () => {
      answered = true
    })

    const user = userEvent.setup()
    renderPage()

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    expect(
      await screen.findByText('put back at the top of the pond — its old place is gone')
    ).toBeInTheDocument()
  })

  it('shows the error and drops the row when a restore is refused (already restored in another tab)', async () => {
    let alreadyRestored = false
    mockListRecords.mockImplementation(async () =>
      alreadyRestored
        ? [record(), record({ id: 'restore-1', action: 'restore', createdAt: '2026-09-27T12:00:00.000Z' })]
        : [record()]
    )
    mockRestorePageRelinked.mockImplementation(async () => {
      alreadyRestored = true
      throw new TrashRefusedError('already-restored', 'change log: already restored')
    })

    const user = userEvent.setup()
    renderPage()

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'that page has already been restored'
    )
    await waitFor(() => {
      expect(screen.queryByTestId('trash-row')).not.toBeInTheDocument()
    })
  })

  it('sends exactly one restore when a row is double-clicked before React re-renders', async () => {
    mockListRecords.mockResolvedValue([record()])

    renderPage()

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    // Both dispatches share ONE `act()` call, so React never gets a chance to
    // commit `busy`'s disabled state between them — the same race a fast
    // real double-click wins against a per-render disable.
    act(() => {
      fireEvent.click(restoreButton)
      fireEvent.click(restoreButton)
    })

    await waitFor(() => {
      expect(mockRestorePageRelinked).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("moves focus to the next row's restore control after restoring a row that isn't last", async () => {
    let restoredTarget: string | null = null
    const base = [
      record({ id: 'del-1', targetPageId: 'page-1', before: snapshot({ title: 'first' }) }),
      record({ id: 'del-2', targetPageId: 'page-2', before: snapshot({ title: 'second' }) }),
    ]
    mockListRecords.mockImplementation(async () =>
      restoredTarget
        ? [
            ...base,
            record({
              id: 'restore-1',
              action: 'restore',
              targetPageId: restoredTarget,
              createdAt: '2026-09-27T12:00:00.000Z',
            }),
          ]
        : base
    )
    mockRestorePageRelinked.mockImplementation(async (_s, _q, vars: { rootPageId: string | null }) => {
      restoredTarget = vars.rootPageId
    })

    const user = userEvent.setup()
    renderPage()

    const [firstRestore, secondRestore] = await screen.findAllByRole('button', { name: 'restore' })
    await user.click(firstRestore)

    await waitFor(() => {
      expect(screen.getAllByTestId('trash-row')).toHaveLength(1)
    })
    expect(secondRestore).toHaveFocus()
  })

  it("moves focus to the previous row's restore control after restoring the last row", async () => {
    let restoredTarget: string | null = null
    const base = [
      record({ id: 'del-1', targetPageId: 'page-1', before: snapshot({ title: 'first' }) }),
      record({ id: 'del-2', targetPageId: 'page-2', before: snapshot({ title: 'second' }) }),
    ]
    mockListRecords.mockImplementation(async () =>
      restoredTarget
        ? [
            ...base,
            record({
              id: 'restore-1',
              action: 'restore',
              targetPageId: restoredTarget,
              createdAt: '2026-09-27T12:00:00.000Z',
            }),
          ]
        : base
    )
    mockRestorePageRelinked.mockImplementation(async (_s, _q, vars: { rootPageId: string | null }) => {
      restoredTarget = vars.rootPageId
    })

    const user = userEvent.setup()
    renderPage()

    const [firstRestore, secondRestore] = await screen.findAllByRole('button', { name: 'restore' })
    await user.click(secondRestore)

    await waitFor(() => {
      expect(screen.getAllByTestId('trash-row')).toHaveLength(1)
    })
    expect(firstRestore).toHaveFocus()
  })

  it('moves focus to the heading when restoring the only row leaves trash empty', async () => {
    mockListRecords.mockImplementation(async () => (mockRestorePageRelinked.mock.calls.length > 0 ? [] : [record()]))

    const user = userEvent.setup()
    renderPage()

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    expect(await screen.findByTestId('trash-empty')).toBeInTheDocument()
    expect(screen.getByText('trash')).toHaveFocus()
  })
})
