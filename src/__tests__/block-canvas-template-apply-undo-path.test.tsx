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
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import type { TemplateKind } from '@/lib/templates/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { SCHEMA_KEY } from '@/lib/properties/schema'

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

// Models the real gap, in `persistBlocksAsOwnEdit`, between the undo step
// becoming available on the stack (`rememberPending`, run here right after
// the blocks are set) and `persistBlocksAsOwnEdit` itself resolving (which
// there waits on a page refetch) — resolved by default, held pending only by
// the fast-⌘Z race test below.
const mockStructuralSettle = jest.fn().mockResolvedValue(undefined)

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
    await mockStructuralSettle()
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
  mockStructuralSettle.mockResolvedValue(undefined)
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
    await waitFor(() => expect(mockSaveProps).toHaveBeenCalled())
    expect(mockSaveProps).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      expect.objectContaining({
        ...PRIOR_PROPS,
        kind: 'meeting notes',
        [SCHEMA_KEY]: expect.arrayContaining([expect.objectContaining({ name: 'date', type: 'date' })]),
      })
    )
    // `applyTemplateSchemaProps` writes the schema through the same
    // `writePageProps` call as the props, not through `defineSchema` — that
    // call would only be overwritten by this one.
    expect(mockDefineSchema).not.toHaveBeenCalled()

    const savePropsAfterApply = mockSaveProps.mock.calls.length

    // PATH_STEPS 2: ⌘Z — one step undoes the whole apply, schema and props
    // included, not only the blocks.
    await sessionUndo.undo('pond-1')

    await waitFor(() =>
      expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterApply)
    )
    expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', PRIOR_PROPS)

    const savePropsAfterUndo = mockSaveProps.mock.calls.length

    // PATH_STEPS 2 (redo): ⇧⌘Z re-applies the whole step — schema and props
    // land again, not only the blocks.
    await sessionUndo.redo('pond-1')

    await waitFor(() =>
      expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterUndo)
    )
    expect(mockSaveProps).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      expect.objectContaining({
        ...PRIOR_PROPS,
        kind: 'meeting notes',
        [SCHEMA_KEY]: expect.arrayContaining([expect.objectContaining({ name: 'date', type: 'date' })]),
      })
    )

    const savePropsAfterRedo = mockSaveProps.mock.calls.length

    // A second ⌘Z reverts the redone step the same way the first one did.
    await sessionUndo.undo('pond-1')

    await waitFor(() =>
      expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterRedo)
    )
    expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', PRIOR_PROPS)
    expect(mockDefineSchema).not.toHaveBeenCalled()
  })
})

async function applyMeetingNotes() {
  renderCanvas([])
  fireEvent.click(screen.getByTestId('trailing-block-gap'))
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')
  const menu = await screen.findByRole('listbox', { name: 'blocks' })
  const meetingNotesRow = within(menu)
    .getAllByRole('option')
    .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'meeting notes')!
  fireEvent.click(meetingNotesRow)
  await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
}

describe('⌘Z/⇧⌘Z race against the apply\'s own in-flight writes (KAN-557)', () => {
  it("a fast ⌘Z waits for this run's own write to settle before reverting, keeping the pre-apply props and no _schema", async () => {
    let releaseSettle: (() => void) | undefined
    mockStructuralSettle.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSettle = resolve
        })
    )

    await applyMeetingNotes()

    // The undo step is already on the stack (`rememberPending` ran before
    // this point) — but `persistBlocksAsOwnEdit` itself, and so this run's
    // own schema/props write (which only starts once it resolves), is still
    // in flight when ⌘Z fires.
    const undonePromise = sessionUndo.undo('pond-1')

    // Flush every microtask tick the queue would get in real use WITHOUT
    // releasing `persistBlocksAsOwnEdit`'s own settle — a correct `onUndone`
    // is still waiting on that write and must not have touched `saveProps`
    // at all yet; one reverting off an already-resolved placeholder would
    // have written the (wrong, premature) revert by now.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(mockSaveProps).not.toHaveBeenCalled()

    releaseSettle?.()
    await undonePromise

    expect(mockSaveProps).toHaveBeenCalled()
    const lastProps = mockSaveProps.mock.calls.at(-1)?.[2]
    expect(lastProps).toEqual(PRIOR_PROPS)
    expect(lastProps).not.toHaveProperty(SCHEMA_KEY)
  })

  it('a snapshot read that rejects skips the props write at apply, then writes nothing on revert either', async () => {
    mockGetPage.mockImplementationOnce(() => Promise.reject(new Error('network down')))
    // If the revert still read the page, this is what it would see — the
    // page's OWN current props, never touched by the skipped apply write
    // (`kind`/`_schema` here are the page's, not this template's). A revert
    // that read this and stripped keys from it would be editing values this
    // apply never wrote.
    mockGetPage.mockImplementationOnce(() =>
      Promise.resolve({
        id: 'page-1',
        props: { ...PRIOR_PROPS, kind: 'tracker', [SCHEMA_KEY]: [{ name: 'status', type: 'text' }] },
      })
    )

    await applyMeetingNotes()

    // Flush the rejected snapshot read's own promise chain (no other mock
    // call marks this apply as finished, now that it never calls
    // `defineSchema`).
    for (let i = 0; i < 20; i++) await Promise.resolve()

    // No write is safer than a lossy one for the bundled schema+props write —
    // the apply must not touch `saveProps` (or `defineSchema`, which it no
    // longer calls at all) when it cannot snapshot what the page carried
    // before.
    expect(mockDefineSchema).not.toHaveBeenCalled()
    expect(mockSaveProps).not.toHaveBeenCalled()

    // The apply wrote nothing, so ⌘Z has nothing to undo — the template's
    // keys on the page are the page's own values, not this apply's.
    await sessionUndo.undo('pond-1')
    for (let i = 0; i < 20; i++) await Promise.resolve()

    expect(mockSaveProps).not.toHaveBeenCalled()

    // The revert never consumed the second queued read above (it no longer
    // reads the page at all) — drain it so it can't leak into the next test.
    mockGetPage.mockReset().mockResolvedValue({ id: 'page-1', props: PRIOR_PROPS })
  })

  it('props changed between undo and redo survive the next undo', async () => {
    await applyMeetingNotes()
    await sessionUndo.undo('pond-1')
    await waitFor(() => expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', PRIOR_PROPS))

    // Someone else edited the page while it sat reverted.
    const editedProps = { glyph: 'moon' }
    mockGetPage.mockResolvedValue({ id: 'page-1', props: editedProps })

    await sessionUndo.redo('pond-1')
    await waitFor(() =>
      expect(mockSaveProps).toHaveBeenLastCalledWith(
        expect.anything(),
        'page-1',
        expect.objectContaining(editedProps)
      )
    )

    await sessionUndo.undo('pond-1')
    await waitFor(() =>
      expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', editedProps)
    )
  })
})

// Every premade whose page is a collection (`schema` present) — derived from
// `premade.ts` itself rather than listed by hand, so a thirteenth template
// with a schema is covered without touching this file.
const KINDS_WITH_SCHEMA = (Object.keys(PREMADE_TEMPLATES) as TemplateKind[]).filter(
  (kind) => PREMADE_TEMPLATES[kind].schema !== undefined
)

describe.each(KINDS_WITH_SCHEMA)(
  '⌘Z after applying `%s` in place reverts its props too (KAN-557)',
  (kind) => {
    it("mockSaveProps is last called with the page's prior props", async () => {
      renderCanvas([])

      fireEvent.click(screen.getByTestId('trailing-block-gap'))
      const editor = await findTextBlock()
      writeInTextBlock(editor, '/')
      const menu = await screen.findByRole('listbox', { name: 'blocks' })
      const row = within(menu)
        .getAllByRole('option')
        .find((o) => o.querySelector('[data-part="label"]')?.textContent === kind)!
      fireEvent.click(row)

      await waitFor(() => expect(mockSaveProps).toHaveBeenCalled())
      const savePropsAfterApply = mockSaveProps.mock.calls.length

      await sessionUndo.undo('pond-1')

      await waitFor(() =>
        expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterApply)
      )
      expect(mockSaveProps).toHaveBeenLastCalledWith(expect.anything(), 'page-1', PRIOR_PROPS)

      const savePropsAfterUndo = mockSaveProps.mock.calls.length

      // ⇧⌘Z re-applies the whole step — schema and props land again too, not
      // only the blocks.
      await sessionUndo.redo('pond-1')

      await waitFor(() =>
        expect(mockSaveProps.mock.calls.length).toBeGreaterThan(savePropsAfterUndo)
      )
      expect(mockSaveProps).toHaveBeenLastCalledWith(
        expect.anything(),
        'page-1',
        expect.objectContaining({ ...PRIOR_PROPS, kind })
      )
      expect(mockDefineSchema).not.toHaveBeenCalled()
    })
  }
)
