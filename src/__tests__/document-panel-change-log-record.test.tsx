/**
 * KAN-152 — `?nodeId=__change_log__&record=<id>` renders `ChangeLogRecordPage`
 * in place of `ChangeLogPage`, and publishes the breadcrumb
 * `life › databases › change log › {record title}` — a loading placeholder
 * for `current` until the record (and its title) resolves, mirroring how
 * `viewTitle` already falls back for an ordinary page.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { withPathProbe } from './helpers/command-path-probe'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'nodeId') return CHANGE_LOG_NODE_ID
      if (key === 'record') return 'rec-1'
      return null
    },
  }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([
    {
      id: 'root-db',
      parent_id: null,
      type: 'page',
      title: 'databases',
      order: 0,
      updated_at: '2026-09-30T00:00:00.000Z',
    },
  ]),
}))
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(0),
  getRecord: (...args: unknown[]) => mockGetRecord(...args),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/conversation/client', () => ({
  ...jest.requireActual('@/lib/conversation/client'),
  getThreadFirstQuestion: jest.fn().mockResolvedValue(null),
}))

const mockGetRecord = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: 'a',
    before: null,
    after: [{ id: 'a', type: 'text', content: 'apple' }],
    sourceThreadId: null,
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:20:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>{withPathProbe(<DocumentPanel />)}</DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPage.mockResolvedValue(null)
})

describe('DocumentPanel — a change log record route', () => {
  it('renders the record page and publishes the breadcrumb with a loading placeholder, then the title', async () => {
    let resolveRecord: (value: ChangeLogRecord) => void = () => {}
    mockGetRecord.mockReturnValue(
      new Promise((resolve) => {
        resolveRecord = resolve
      })
    )

    renderPanel()

    await waitFor(() =>
      expect(screen.getByTestId('command-path')).toHaveTextContent(
        'life › databases › change log › loading…'
      )
    )
    expect(screen.getByTestId('change-log-record-loading')).toBeInTheDocument()

    resolveRecord(record())

    await waitFor(() =>
      expect(screen.getByTestId('command-path')).toHaveTextContent(
        'life › databases › change log › apple'
      )
    )
    expect(screen.getByTestId('change-log-record-title')).toHaveTextContent('apple')
  })

  it('shows "not found" once a missing or invisible record resolves to null, not "loading…" forever', async () => {
    mockGetRecord.mockResolvedValue(null)

    renderPanel()

    await waitFor(() =>
      expect(screen.getByTestId('command-path')).toHaveTextContent(
        'life › databases › change log › not found'
      )
    )
    expect(screen.getByTestId('change-log-record-not-found')).toBeInTheDocument()
  })

  it('never renders ChangeLogPage’s own surface for a record route', async () => {
    mockGetRecord.mockResolvedValue(record())

    renderPanel()

    await screen.findByTestId('change-log-record-title')
    expect(screen.queryByTestId('change-log-column')).not.toBeInTheDocument()
  })

  it('the "databases" and "change log" crumbs are links, not dead text', async () => {
    mockGetRecord.mockResolvedValue(record())

    renderPanel()

    await screen.findByTestId('change-log-record-title')
    const crumbs = screen.getAllByTestId('command-path-crumb')
    const databasesCrumb = crumbs.find((c) => c.dataset.title === 'databases')
    const changeLogCrumb = crumbs.find((c) => c.dataset.title === 'change log')
    expect(databasesCrumb?.dataset.linkable).toBe('true')
    expect(changeLogCrumb?.dataset.linkable).toBe('true')
  })

  it("the breadcrumb's last crumb is the record's own name, not its full before → after title", async () => {
    mockGetRecord.mockResolvedValue(
      record({
        action: 'edit_row',
        targetBlockId: 'db-1',
        before: {
          id: 'row-1',
          title: 'electrician, second fix',
          values: { due: 'w/c 13 oct' },
          shown: { due: 'w/c 13 oct' },
        },
        after: {
          id: 'row-1',
          title: 'electrician, second fix',
          values: { due: 'w/c 6 oct' },
          shown: { due: 'w/c 6 oct' },
        },
      })
    )

    renderPanel()

    await waitFor(() =>
      expect(screen.getByTestId('command-path')).toHaveTextContent(
        'life › databases › change log › electrician, second fix'
      )
    )
    expect(screen.getByTestId('command-path')).not.toHaveTextContent('w/c 6 oct')
    expect(screen.getByTestId('change-log-record-title')).toHaveTextContent(
      'electrician, second fix → w/c 6 oct'
    )
  })
})
