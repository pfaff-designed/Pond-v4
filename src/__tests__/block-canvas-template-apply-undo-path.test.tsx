/**
 * KAN-557 — applying a premade template with a schema (`meeting notes`) in
 * place writes its blocks through `persistBlocksAsOwnEdit` (one ⌘Z step), but
 * the schema (`defineSchema`) and props (`saveProps`) writes that follow are
 * NOT part of that step: no `onUndone`/`onRedone` travels with them. ⌘Z
 * reverts the blocks but leaves the schema and props behind — the "record
 * block" (the properties frame DocumentPanel draws from the page's schema)
 * stays on the page.
 *
 * Harness mirrors `block-canvas-view-insert-undo-path.test.tsx` (real
 * `BlockCanvas`, real `sessionUndo`, `undoStep`/`redoStep` mocked at the RPC
 * boundary) — this item is the apply's own undo-step wiring, not the ⌘Z key
 * binding, so `sessionUndo.undo` is called directly.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const mockCreateClient = jest.fn().mockReturnValue({})
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockFetchPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

const PRIOR_PROPS = { glyph: 'sun' }
const mockGetPage = jest.fn().mockResolvedValue({ id: 'page-1', props: PRIOR_PROPS })
const mockDefineSchema = jest.fn().mockResolvedValue(undefined)
const mockSaveProps = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  defineSchema: (...args: unknown[]) => mockDefineSchema(...args),
  saveProps: (...args: unknown[]) => mockSaveProps(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))

let recordSeq = 0
const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  listRecords: jest.fn().mockResolvedValue([]),
}))

// `session-undo.ts` stays real: this proves the template apply's own
// `onUndone`/`onRedone` wiring (or lack of it) off one real stack. Only the
// RPC boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

type StructuralOpts = {
  discardOnFailure?: boolean
  onUndone?: () => Promise<void> | void
  onRedone?: () => Promise<void> | void
}

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)

  const onStructuralWrite = async (next: Block[], opts?: StructuralOpts) => {
    setBlocks(next)
    const record = await mockAppendOwnEdit()
    sessionUndo.rememberPending({
      pondId: 'pond-1',
      recordIds: Promise.resolve([record.id]),
      onUndone: opts?.onUndone,
      onRedone: opts?.onRedone,
    })
    return true
  }

  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="Health"
      onChange={setBlocks}
      onStructuralWrite={onStructuralWrite}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  recordSeq = 0
  mockCreateClient.mockReturnValue({})
  mockFetchPages.mockResolvedValue([])
  mockGetPage.mockResolvedValue({ id: 'page-1', props: PRIOR_PROPS })
  mockDefineSchema.mockResolvedValue(undefined)
  mockSaveProps.mockResolvedValue(undefined)
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  jest.mocked(redoStep).mockResolvedValue({ outcome: 'done', records: [] })
  sessionUndo.clear()
})

describe('⌘Z after applying `meeting notes` in place undoes the whole template (KAN-557)', () => {
  it('reverts the blocks, the schema it defined, and the props it wrote', async () => {
    renderCanvas([])

    // PATH_STEPS 1: a blank page's `/` leads with templates.
    fireEvent.click(screen.getByTestId('trailing-block-gap'))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const meetingNotesRow = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'meeting notes')!
    fireEvent.click(meetingNotesRow)

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockDefineSchema).toHaveBeenCalledTimes(1))
    expect(mockDefineSchema).toHaveBeenCalledWith(
      expect.anything(),
      'page-1',
      expect.arrayContaining([expect.objectContaining({ name: 'date', type: 'date' })])
    )
    await waitFor(() => expect(mockSaveProps).toHaveBeenCalled())
    expect(mockSaveProps).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      expect.objectContaining({ ...PRIOR_PROPS, kind: 'meeting notes' })
    )

    const definesAfterApply = mockDefineSchema.mock.calls.length
    const savePropsAfterApply = mockSaveProps.mock.calls.length

    // PATH_STEPS 2: ⌘Z — one step undoes the whole apply, schema and props
    // included, not only the blocks.
    await sessionUndo.undo('pond-1')

    await waitFor(() =>
      expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterApply)
    )
    expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', PRIOR_PROPS)
    // `meeting notes` carries a schema — undoing it must put the page's prior
    // (schema-less) props back, not just restore the blocks.
    expect(mockDefineSchema.mock.calls.length).toBe(definesAfterApply)

    const definesAfterUndo = mockDefineSchema.mock.calls.length
    const savePropsAfterUndo = mockSaveProps.mock.calls.length

    // PATH_STEPS 2 (redo): ⇧⌘Z re-applies the whole step — schema and props
    // land again, not only the blocks.
    await sessionUndo.redo('pond-1')

    await waitFor(() =>
      expect(mockDefineSchema.mock.calls.length).toBeGreaterThan(definesAfterUndo)
    )
    expect(mockDefineSchema).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      expect.arrayContaining([expect.objectContaining({ name: 'date', type: 'date' })])
    )
    await waitFor(() =>
      expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterUndo)
    )
    expect(mockSaveProps).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      expect.objectContaining({ ...PRIOR_PROPS, kind: 'meeting notes' })
    )

    const definesAfterRedo = mockDefineSchema.mock.calls.length
    const savePropsAfterRedo = mockSaveProps.mock.calls.length

    // A second ⌘Z reverts the redone step the same way the first one did.
    await sessionUndo.undo('pond-1')

    await waitFor(() =>
      expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterRedo)
    )
    expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', PRIOR_PROPS)
    expect(mockDefineSchema.mock.calls.length).toBe(definesAfterRedo)
  })
})
