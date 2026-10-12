/**
 * KAN-93 path test A1 — the person's path: accept a diff in the composer, then
 * ⌘Z/⇧⌘Z at the shell level undoes/redoes it as one step. Mocks the same
 * surfaces as `propose-changes-flow-ui.test.tsx` (the accept path), but — unlike
 * that file — leaves `@/lib/change-log/session-undo` real: this test is what
 * proves the accept wiring and the shell chord actually share one stack. Only
 * the RPC boundary (`@/lib/change-log/undo`) is mocked.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/context', () => {
  const active = { pond: { id: 'pond-7' }, ponds: [], loading: false, reload: () => {}, addPond: () => {} }
  return {
    ...jest.requireActual('@/lib/pond/context'),
    usePond: () => active,
    usePondId: () => active.pond.id,
  }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

const mockGetPage = jest.fn().mockResolvedValue(null)
const mockListPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  collectionTitleResolver: () => () => undefined,
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

let mockResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: mockResolutions,
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockListByCalls = jest.fn()
const mockGetRecordByToolCall = jest.fn().mockResolvedValue(null)
const mockAcceptRecord = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/change-log/store', () => ({
  // `undo.ts`'s own `mapChangeLogRow` import must resolve for real: it is never
  // mocked, only `undoStep`/`redoStep` are.
  ...jest.requireActual('@/lib/change-log/store'),
  listRecordsByToolCalls: (...args: unknown[]) => mockListByCalls(...args),
  getRecordByToolCall: (...args: unknown[]) => mockGetRecordByToolCall(...args),
  advanceStatus: jest.fn(),
  acceptRecord: (...args: unknown[]) => mockAcceptRecord(...args),
  markOutdated: jest.fn(),
}))

const mockRequestNotify = jest.fn()
jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: (...args: unknown[]) => mockRequestNotify(...args),
}))

// The RPC boundary only: the session stack above it (`session-undo.ts`) is real.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
const mockSetMessages = jest.fn()
const mockAddToolOutput = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}> = []

let mockStatus = 'ready'
let mockError: Error | undefined
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
    addToolOutput: mockAddToolOutput,
    setMessages: mockSetMessages,
    status: mockStatus,
    error: mockError,
  })),
}))

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import { pagesKey } from '@/lib/pages/keys'
import { changeLogKey } from '@/lib/change-log/keys'
import { applyProposedChanges } from '@/lib/pages/edits'
import { createDeterministicMintId } from '@/lib/change-log/mint-id'
import type { ModuleChange } from '@/lib/modules/ai-composition'

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ShellCommands />
      <AITerminal />
    </QueryClientProvider>
  )
  return queryClient
}

function batch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [
        { op: 'create', data: { type: 'text', content: `first line of ${toolCallId}` } },
        { op: 'create', data: { type: 'text', content: `second line of ${toolCallId}` } },
      ],
    },
  }
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

/**
 * A ChangeLogRecord whose accept makes it undoable (KAN-93). `after` is computed
 * the same way propose.ts computes it — real `applyProposedChanges`, seeded by
 * the SAME toolCallId — against an empty page (every test here accepts onto a
 * page whose mocked `getPage` returns `blocks: []`), so the accept write lands
 * blocks byte-identical to it, the way accept.ts's recordId gate now requires.
 */
function fakeRecord(id: string, toolCallId: string, targetPageId: string) {
  const changes = batch(toolCallId).input.changes as ModuleChange[]
  const after = applyProposedChanges([], changes, createDeterministicMintId(toolCallId), {
    batch: changes,
  }).blocks
  return {
    id,
    userId: 'user-1',
    pondId: 'pond-7',
    status: 'proposed' as const,
    action: 'edit' as const,
    actor: 'pond',
    targetPageId,
    targetBlockId: null,
    before: [],
    after,
    sourceThreadId: null,
    toolCallId,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    statusAt: '2026-10-01T00:00:00.000Z',
  }
}

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

beforeEach(() => {
  jest.clearAllMocks()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockListByCalls.mockResolvedValue([])
  mockGetRecordByToolCall.mockReset().mockResolvedValue(null)
  mockAcceptRecord.mockReset().mockResolvedValue(undefined)
  mockGetPage.mockReset().mockResolvedValue(null)
  mockListPages.mockReset().mockResolvedValue([])
  mockCommitBlocks.mockReset().mockResolvedValue(undefined)
  mockStatus = 'ready'
  mockError = undefined
  mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1')] }]
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [fakeRecord('rec-1', 'pc1', 'page-b')] })
  jest.mocked(redoStep).mockResolvedValue({ outcome: 'done', records: [fakeRecord('rec-1', 'pc1', 'page-b')] })
  onPlatform('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('accept a diff, then ⌘Z/⇧⌘Z take it back and put it back (KAN-93 path A1)', () => {
  it('undoes the accepted record with ⌘Z and redoes it with ⇧⌘Z, as one step', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockGetRecordByToolCall.mockResolvedValue(fakeRecord('rec-1', 'pc1', pageB.id))

    renderApp()
    await ready()
    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)
    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockAcceptRecord).toHaveBeenCalledTimes(1))

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), { pondId: 'pond-7', recordIds: ['rec-1'] })

    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')

    await waitFor(() => expect(redoStep).toHaveBeenCalledTimes(1))
    expect(redoStep).toHaveBeenCalledWith(expect.anything(), { pondId: 'pond-7', recordIds: ['rec-1'] })
  })

  it('on done invalidates the page and change-log caches; on stale it shows the notice and changes nothing else', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockGetRecordByToolCall.mockResolvedValue(fakeRecord('rec-1', 'pc1', pageB.id))

    const queryClient = renderApp()
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')
    await ready()
    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)
    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockAcceptRecord).toHaveBeenCalledTimes(1))

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: pagesKey() }))
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: changeLogKey() })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', pageB.id] })

    invalidateQueries.mockClear()
    jest.mocked(undoStep).mockResolvedValueOnce({ outcome: 'stale', reason: 'page-changed' })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
    await screen.findByText(/can't undo — the page changed since/)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('a blocked outcome shows its own notice line, and a second ⌘Z retries the same step', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockGetRecordByToolCall.mockResolvedValue(fakeRecord('rec-1', 'pc1', pageB.id))

    renderApp()
    await ready()
    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)
    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockAcceptRecord).toHaveBeenCalledTimes(1))

    await user.click(document.body)
    jest.mocked(undoStep).mockResolvedValue({ outcome: 'blocked', reason: 'not-an-area' })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    await screen.findByText(/can't undo — the page is no longer an area/)

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
    expect(undoStep).toHaveBeenNthCalledWith(1, expect.anything(), {
      pondId: 'pond-7',
      recordIds: ['rec-1'],
    })
    expect(undoStep).toHaveBeenNthCalledWith(2, expect.anything(), {
      pondId: 'pond-7',
      recordIds: ['rec-1'],
    })
  })

  it('an editable keeps its own ⌘Z — the composer input, then any contenteditable', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockGetRecordByToolCall.mockResolvedValue(fakeRecord('rec-1', 'pc1', pageB.id))

    renderApp()
    await ready()
    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)
    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockAcceptRecord).toHaveBeenCalledTimes(1))

    const input = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.click(input)
    await user.keyboard('{Meta>}z{/Meta}')
    expect(undoStep).not.toHaveBeenCalled()

    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.appendChild(editable)
    fireEvent.keyDown(editable, { key: 'z', metaKey: true })
    expect(undoStep).not.toHaveBeenCalled()

    document.body.removeChild(editable)
  })
})
