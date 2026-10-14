/**
 * KAN-124 fix: a fast `/` ↓ ↵ on a blank page lands inside `use-page-draft.ts`'s
 * 600ms debounce while the slash keystroke itself is still unsaved. Without
 * flushing that pending save first, the apply's own cache write is silently
 * ignored (the draft only adopts over a SAVED cache — `use-page-draft.ts:78`),
 * and the slash save later fires with a stale baseline, double-logging the
 * same apply as a second own-edit record — so ⌘Z only takes back half of it.
 *
 * This must be hosted through the real `usePageDraft` (via DocumentPanel), not
 * the BlockCanvas BlankPageHarness (`onChange={setBlocks}`): that harness has no
 * debounce to race against, so it cannot see this bug. `commitBlocks` itself is
 * left unmocked (unlike `document-panel-blocks.test.tsx`) so its real own-edit
 * logging — which no-ops when before/after are byte-equal — actually runs.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

const mockListTemplates = jest.fn()
jest.mock('@/lib/templates/client', () => ({
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
const mockSaveProps = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  createPage: jest.fn(),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: (...args: unknown[]) => mockSaveProps(...args),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

// `@/lib/pages/commit` (`commitBlocks`) is deliberately left REAL: its own-edit
// logging is what proves the fix. Only its leaves are mocked.
const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-x' })
const mockMarkOutdated = jest.fn().mockResolvedValue([])
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  markOutdated: (...args: unknown[]) => mockMarkOutdated(...args),
}))
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockListTemplates.mockResolvedValue([
    {
      id: 't1',
      name: 'weeknight recipe',
      kind: 'page',
      origin: 'yours',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [{ id: 'old-1', type: 'text', content: 'chickpeas, harissa' }],
    },
  ])
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-x' })
  mockMarkOutdated.mockResolvedValue([])
  mockSaveBlocks.mockResolvedValue(undefined)
  mockSaveProps.mockResolvedValue(undefined)
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
})

const BLANK_LINE: Block[] = [{ id: 'b1', type: 'text', content: '' }]

function renderBlankPage() {
  mockGetPage.mockResolvedValue({ id: 'page-1', parentId: null, type: 'page', title: '', blocks: BLANK_LINE })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

it('a fast `/` then a template pick (within the draft debounce) logs the apply once, not twice', async () => {
  renderBlankPage()
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')

  // Pick the `yours` template IMMEDIATELY — well inside the 600ms debounce the
  // slash keystroke just scheduled, which is exactly the race this fixes.
  fireEvent.click(await screen.findByText('weeknight recipe'))

  // The fix flushes the slash keystroke's own pending save first, so its
  // `saveBlocks` call (content still `/`) lands before the apply's — find the
  // apply's own call by its content, not by call order.
  const firstBlockContent = (call: unknown[]): string | undefined =>
    (call[2] as Block[])[0] && 'content' in (call[2] as Block[])[0]
      ? ((call[2] as Block[])[0] as { content: string }).content
      : undefined
  await waitFor(() =>
    expect(mockSaveBlocks.mock.calls.some((call) => firstBlockContent(call) !== '/')).toBe(true)
  )
  const appliedCall = mockSaveBlocks.mock.calls.find((call) => firstBlockContent(call) !== '/')!
  const appliedBlocks = appliedCall[2]
  expect(appliedBlocks).toEqual([
    { id: expect.not.stringMatching(/^old-1$/), type: 'text', content: 'chickpeas, harissa' },
  ])

  // Let the slash keystroke's (now flushed) save and the apply's own trailing
  // `onChange`-scheduled save both land for real.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, EDIT_PAUSE_MS + 150))
  })

  // Exactly one call logged the applied blocks as its own-edit `after` — the
  // apply's direct record. A second one (the bug) would mean the draft's own
  // debounced save fired with a stale `before`, double-logging the same apply.
  const callsLoggingTheApply = mockAppendOwnEdit.mock.calls.filter(([, input]) =>
    JSON.stringify((input as { after: unknown }).after) === JSON.stringify(appliedBlocks)
  )
  expect(callsLoggingTheApply).toHaveLength(1)

  // Apply is one undo step: exactly one record remembered for it.
  expect(mockRemember).toHaveBeenCalledTimes(1)
  expect(mockRemember.mock.calls[0][0].recordIds).toHaveLength(1)
})
