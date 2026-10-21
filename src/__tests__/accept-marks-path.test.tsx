/**
 * KAN-143's path test — PATH_STEPS end to end on the real page host
 * (`DocumentPanel`, not `TodoView` alone): accept a diff against a todo
 * block's rows, see the two touched rows (and only those two) carry
 * "changed HH:MM", then a genuine close/reopen (unmount + remount) clears
 * them.
 *
 * Drives the accept through `writeAcceptedChanges` (`accept.ts`) — the same
 * entry point the composer's card and "accept all" both funnel through —
 * against the mounted `DocumentPanel`'s own `QueryClient`, so the real
 * `accept-marks` store and the real `TodoView` render are what is under
 * test, not a mock of either. `userId: null` keeps this off the
 * change-log/store boundary entirely (`readProposalForAccept` short-circuits
 * on a null user), matching `accept-changes.test.ts`'s "legacy, no record"
 * cases — this path test is about the mark, not the change log.
 *
 * `formatClockTime` reads the machine's local time zone, so the expected
 * mark text is built the same way the view builds it rather than a literal
 * clock string (AGENTS.md: a test must not assert a machine-specific literal
 * unless it pins that machine).
 */

import React from 'react'
import { render, screen, within, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { emptyResolutions } from '@/lib/conversation/resolutions'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import { formatClockTime } from '@/lib/change-log/page-changes'
import { clear as clearAcceptMarks } from '@/lib/change-log/accept-marks'

const PAGE_ID = 'page-1'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? PAGE_ID : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

const TODO_BLOCK_ID = 'b1'

let fakeBlocks: Block[]

function resetFakePage() {
  fakeBlocks = [
    {
      id: TODO_BLOCK_ID,
      type: 'todo',
      items: [
        { id: 'i1', label: 'electrician, second fix', checked: false },
        { id: 'i2', label: 'worktop template', checked: false },
        { id: 'i3', label: 'tiles', checked: false },
      ],
    } as Block,
  ]
}
resetFakePage()

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn(async (_supabase: unknown, _queryClient: unknown, _pageId: string, blocks: Block[]) => {
  fakeBlocks = blocks
})
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: Parameters<typeof mockCommitBlocks>) => mockCommitBlocks(...args),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

function renderPage() {
  mockGetPage.mockImplementation(async () => ({
    id: PAGE_ID,
    title: 'renovation',
    blocks: fakeBlocks,
    props: {},
  }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { ...result, queryClient }
}

/**
 * The accepted batch: ticks the first two rows, leaves the third untouched. No item
 * carries an id — `ai-composition.ts`'s omit-chain strips every item id from what
 * the AI emits, so `hydrateBlock` mints a fresh id for every item on this edit,
 * same as the real tool call.
 */
function acceptEditChanges(): ModuleChange[] {
  return [
    {
      op: 'edit',
      blockId: TODO_BLOCK_ID,
      data: {
        type: 'todo',
        items: [
          { label: 'electrician, second fix', checked: true },
          { label: 'worktop template', checked: true },
          { label: 'tiles', checked: false },
        ],
      },
    } as ModuleChange,
  ]
}

function rowFor(label: string): HTMLElement {
  return screen.getByDisplayValue(label).closest('[data-item-id]') as HTMLElement
}

beforeEach(() => {
  jest.clearAllMocks()
  resetFakePage()
  clearAcceptMarks()
})

describe('an accept marks the rows it touched, and the mark clears on the next open (KAN-143)', () => {
  it('marks the two changed rows, leaves the untouched row bare, then clears on remount', async () => {
    const { queryClient, unmount } = renderPage()
    await screen.findByDisplayValue('tiles')

    const acceptedAt = new Date().toISOString()
    await act(async () => {
      await writeAcceptedChanges({
        supabase: {} as SupabaseClient<Database>,
        queryClient,
        userId: null,
        pondId: null,
        resolutions: emptyResolutions(),
        toolCallId: 'pc1',
        openNodeId: PAGE_ID,
        changes: acceptEditChanges(),
      })
    })

    const expectedMark = `changed ${formatClockTime(acceptedAt)}`
    expect(await within(rowFor('electrician, second fix')).findByText(expectedMark)).toBeInTheDocument()
    expect(within(rowFor('worktop template')).getByText(expectedMark)).toBeInTheDocument()
    expect(within(rowFor('tiles')).queryByText(/^changed /)).not.toBeInTheDocument()

    // A genuine close/reopen — not another render of the same mount — must
    // clear the marks the first open already showed.
    unmount()
    renderPage()
    await screen.findByDisplayValue('tiles')

    expect(screen.queryByText(expectedMark)).not.toBeInTheDocument()
  })
})
