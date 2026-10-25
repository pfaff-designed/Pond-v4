/**
 * Record edits are your own edits too ("08:47 added chickpeas, harissa ·
 * recipes · you · accepted"). A cell, a title or a new row
 * writes through at once, and the change log gets one `accepted` record per
 * pause — not one per keystroke — filed against the collection page. A record
 * says only what the database kept: it waits for the writes in its pause to
 * settle, and a refused write is never in it.
 */

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCollectionRows } from '@/lib/modules/view/use-collection-rows'
import { getPage } from '@/lib/pages/client'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { sessionUndo } from '@/lib/change-log/session-undo'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Pond } from '@/lib/pond/client'
import type { PropertySchema } from '@/lib/properties/schema'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

// `sessionUndo` (the real singleton) runs its RPCs through `undoStep`/`redoStep` —
// mocked here so a real `sessionUndo.undo()` call in a test can be timed against
// `setValueAsStep`'s write and log without reaching a database.
const mockUndoStep = jest.fn()
jest.mock('@/lib/change-log/undo', () => ({
  undoStep: (...args: unknown[]) => mockUndoStep(...args),
  redoStep: jest.fn(),
}))

const SCHEMA = [
  { id: 'status', name: 'status', type: 'text' },
  {
    id: 'stage',
    name: 'stage',
    type: 'select',
    options: [
      { id: 'o-want', label: 'want to cook' },
      { id: 'o-cooked', label: 'cooked' },
    ],
  },
]

const ROW = { id: 'row-1', title: 'dal', type: 'row', props: { status: 'want', stage: 'o-want' } }

const mockSetProperty = jest.fn()
const mockUpdateTitle = jest.fn()
const mockCreatePage = jest.fn()
const mockGetCollectionRows = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async () => ({
    id: 'col-1',
    title: 'recipes',
    props: { _schema: SCHEMA },
    blocks: [],
  })),
  getCollectionRows: (...args: unknown[]) => mockGetCollectionRows(...args),
  setProperty: (...args: unknown[]) => mockSetProperty(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

const pondNamed = (id: string): Pond => ({ id, name: id, glyph: null, theme: 'paper', order: 0 })

let activePond: Pond | null = null

const pondContext = (): PondContextValue => ({
  pond: activePond,
  ponds: activePond ? [activePond] : [],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
  removePond: () => {},
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <PondContext.Provider value={pondContext()}>{children}</PondContext.Provider>
    </QueryClientProvider>
  )
  return renderHook(() => useCollectionRows('col-1'), { wrapper })
}

async function mounted() {
  const hook = mount()
  await waitFor(() => {
    expect(hook.result.current.rows).toHaveLength(1)
    expect(hook.result.current.schema).not.toBeNull()
  })
  return hook
}

/** Long enough for one pause to close, short enough to stay fast. */
const afterThePause = { timeout: 2000 }
const waitOutThePause = () => new Promise((r) => setTimeout(r, 900))

const deferred = () => {
  let resolve: () => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res()
    reject = rej
  })
  return { promise, resolve, reject }
}

const snapshot = (title: string, status: string, stage: string, stageLabel: string) => ({
  id: 'row-1',
  title,
  values: { status, stage },
  shown: { status, stage: stageLabel },
})

beforeEach(() => {
  jest.clearAllMocks()
  sessionUndo.clear()
  activePond = null
  mockSetProperty.mockResolvedValue(undefined)
  mockUpdateTitle.mockResolvedValue(undefined)
  mockGetCollectionRows.mockResolvedValue([ROW])
  mockAppendOwnEdit.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
  mockUndoStep.mockResolvedValue({ outcome: 'done', records: [] })
})

describe('useCollectionRows — record edits are logged by pause', () => {
  it('a run of keystrokes in one cell is one record, filed against the collection', async () => {
    activePond = pondNamed('pond-1')
    const { result } = await mounted()

    act(() => {
      result.current.setValue('row-1', 'status', 'w')
      result.current.setValue('row-1', 'status', 'we')
      result.current.setValue('row-1', 'status', 'weeknight')
    })

    // Every keystroke still writes through at once.
    expect(mockSetProperty).toHaveBeenCalledTimes(3)
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toEqual({
      userId: 'user-1',
      pondId: 'pond-1',
      action: 'edit_row',
      targetPageId: 'col-1',
      before: snapshot('dal', 'want', 'o-want', 'want to cook'),
      after: snapshot('dal', 'weeknight', 'o-want', 'want to cook'),
    })
  })

  it('carries a choice as the label the field shows, not its stored id', async () => {
    const { result } = await mounted()

    act(() => result.current.setValue('row-1', 'stage', 'o-cooked'))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1].after).toEqual(
      snapshot('dal', 'want', 'o-cooked', 'cooked')
    )
  })

  it('a rename typed letter by letter is one record', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.renameRow('row-1', 'dal,')
      result.current.renameRow('row-1', 'dal, weeknight')
    })

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      action: 'edit_row',
      before: { title: 'dal' },
      after: { title: 'dal, weeknight' },
    })
  })

  it('adding a record and naming it in one pause is one "added" record', async () => {
    mockCreatePage.mockResolvedValue({ id: 'row-2', title: '', type: 'row', props: {} })
    const { result } = await mounted()

    await act(async () => {
      await result.current.addRow()
    })
    act(() => result.current.renameRow('row-2', 'chickpeas, harissa'))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      action: 'add_row',
      targetPageId: 'col-1',
      before: null,
      after: { id: 'row-2', title: 'chickpeas, harissa', values: {}, shown: { status: '' } },
    })
  })

  it('a value typed and then typed back is no change, and no record', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.setValue('row-1', 'status', 'wan')
      result.current.setValue('row-1', 'status', 'want')
    })

    await waitOutThePause()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a write that did not land is not logged', async () => {
    mockSetProperty.mockRejectedValueOnce(new Error('rls'))
    const { result } = await mounted()

    act(() => result.current.setValue('row-1', 'status', 'weeknight'))

    await waitOutThePause()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a write refused only after the pause is not logged either', async () => {
    const write = deferred()
    mockSetProperty.mockReturnValueOnce(write.promise)
    const { result } = await mounted()

    act(() => result.current.setValue('row-1', 'status', 'weeknight'))
    await waitOutThePause()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    await act(async () => write.reject(new Error('rls')))
    await waitOutThePause()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a refused rename does not cost the value change that landed in the same pause', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('rls'))
    const { result } = await mounted()

    act(() => {
      result.current.setValue('row-1', 'status', 'weeknight')
      result.current.renameRow('row-1', 'dal, weeknight')
    })

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      before: { title: 'dal', values: { status: 'want' } },
      after: { title: 'dal', values: { status: 'weeknight' } },
    })
  })

  it('after a refused write, the next record starts from what is stored', async () => {
    mockSetProperty.mockRejectedValueOnce(new Error('rls'))
    const { result } = await mounted()
    // The reconcile refetch is still out: the view still shows the refused value.
    mockGetCollectionRows.mockReturnValue(new Promise(() => {}))

    act(() => result.current.setValue('row-1', 'status', 'refused'))
    await waitOutThePause()
    act(() => result.current.setValue('row-1', 'status', 'cooking'))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      before: { values: { status: 'want' } },
      after: { values: { status: 'cooking' } },
    })
  })

  it('removing a record mid-pause drops its open group', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.setValue('row-1', 'status', 'weeknight')
      result.current.removeRow('row-1')
    })

    await waitOutThePause()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a pond that resolves mid-pause files the record in that pond, at the pause', async () => {
    const { result, rerender } = await mounted()

    act(() => result.current.setValue('row-1', 'status', 'weeknight'))
    activePond = pondNamed('pond-2')
    rerender()

    // Resolving the pond is not leaving: nothing closes early, under no pond.
    await act(async () => {})
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1), afterThePause)
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({ pondId: 'pond-2' })
  })

  it('leaving mid-pause still logs what was done', async () => {
    const { result, unmount } = await mounted()

    act(() => result.current.setValue('row-1', 'status', 'weeknight'))
    unmount()

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
  })

  it('a failed append fails nothing the person sees', async () => {
    mockAppendOwnEdit.mockRejectedValueOnce(new Error('rls'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = await mounted()

    act(() => result.current.setValue('row-1', 'status', 'weeknight'))

    await waitFor(() => expect(spy).toHaveBeenCalled(), afterThePause)
    expect(result.current.rows[0].values).toEqual({ status: 'weeknight', stage: 'o-want' })
    spy.mockRestore()
  })
})

describe('useCollectionRows — a schema edit is logged at once, not by pause (KAN-380)', () => {
  const before: PropertySchema = [{ id: 'status', name: 'status', type: 'text' }]
  const after: PropertySchema = [{ id: 'status', name: 'due', type: 'text' }]

  it('writes one edit_schema record immediately — no pause to wait out', async () => {
    activePond = pondNamed('pond-1')
    const { result } = await mounted()

    act(() => result.current.logSchemaEdit(before, after))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(mockAppendOwnEdit.mock.calls[0][1]).toEqual({
      userId: 'user-1',
      pondId: 'pond-1',
      action: 'edit_schema',
      targetPageId: 'col-1',
      before,
      after,
    })
  })

  it('writes nothing when before and after are the same schema', async () => {
    const { result } = await mounted()

    act(() => result.current.logSchemaEdit(before, before))
    await waitOutThePause()

    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a failed append fails nothing the person sees', async () => {
    mockAppendOwnEdit.mockRejectedValueOnce(new Error('rls'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = await mounted()

    act(() => result.current.logSchemaEdit(before, after))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockRestore()
  })
})

describe('useCollectionRows — setValueAsStep logs its own record, as its own pause group', () => {
  it('two calls on the same row in one tick each produce their own record', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.setValueAsStep('row-1', 'status', 'weeknight')
      result.current.setValueAsStep('row-1', 'status', 'cooking')
    })

    // Neither call waits out the pause, and the second never folds into the
    // first's group: both are logged, in order, as two records.
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(2))
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      action: 'edit_row',
      before: { values: { status: 'want' } },
      after: { values: { status: 'weeknight' } },
    })
    expect(mockAppendOwnEdit.mock.calls[1][1]).toMatchObject({
      action: 'edit_row',
      before: { values: { status: 'weeknight' } },
      after: { values: { status: 'cooking' } },
    })
  })

  it('a value equal to what is stored appends nothing', async () => {
    const { result } = await mounted()

    await act(async () => {
      result.current.setValueAsStep('row-1', 'status', 'want')
    })

    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a refused write is logged as nothing — no record, no undo step', async () => {
    activePond = pondNamed('pond-1')
    mockSetProperty.mockRejectedValueOnce(new Error('rls'))
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mounted()

    await act(async () => {
      result.current.setValueAsStep('row-1', 'status', 'weeknight')
    })
    await waitOutThePause()

    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
    expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(false)
  })

  it('a typed edit then a drop on the same row within the pause logs two records, in order', async () => {
    mockAppendOwnEdit
      .mockResolvedValueOnce({ id: 'rec-typed' } as ChangeLogRecord)
      .mockResolvedValueOnce({ id: 'rec-drop' } as ChangeLogRecord)
    const { result } = await mounted()

    act(() => {
      result.current.setValue('row-1', 'status', 'weeknight')
      result.current.setValueAsStep('row-1', 'stage', 'o-cooked')
    })

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(2))
    // The typed edit's own pause closes — and logs — ahead of the drop's.
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      before: snapshot('dal', 'want', 'o-want', 'want to cook'),
      after: snapshot('dal', 'weeknight', 'o-want', 'want to cook'),
    })
    // The drop's own group starts from what the typed edit actually left stored.
    expect(mockAppendOwnEdit.mock.calls[1][1]).toMatchObject({
      before: snapshot('dal', 'weeknight', 'o-want', 'want to cook'),
      after: snapshot('dal', 'weeknight', 'o-cooked', 'cooked'),
    })
  })
})

describe('useCollectionRows — setValueAsStep wires session-undo', () => {
  it('the record becomes the top of the undo stack for its pond', async () => {
    activePond = pondNamed('pond-1')
    mockAppendOwnEdit.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
    const { result } = await mounted()

    await act(async () => {
      result.current.setValueAsStep('row-1', 'status', 'weeknight')
    })

    await waitFor(() =>
      expect(sessionUndo.getSnapshot('pond-1').topUndoRecordIds).toEqual(['rec-1'])
    )
  })

  it('two fast drops are two steps, not one', async () => {
    activePond = pondNamed('pond-1')
    mockAppendOwnEdit
      .mockResolvedValueOnce({ id: 'rec-1' } as ChangeLogRecord)
      .mockResolvedValueOnce({ id: 'rec-2' } as ChangeLogRecord)
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mounted()

    act(() => {
      result.current.setValueAsStep('row-1', 'status', 'weeknight')
      result.current.setValueAsStep('row-1', 'status', 'cooking')
    })

    await waitFor(() => expect(remember).toHaveBeenCalledTimes(2))
    expect(remember.mock.calls[0][0]).toMatchObject({ pondId: 'pond-1', recordIds: ['rec-1'] })
    expect(remember.mock.calls[1][0]).toMatchObject({ pondId: 'pond-1', recordIds: ['rec-2'] })
  })

  it('an unchanged write remembers nothing', async () => {
    activePond = pondNamed('pond-1')
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mounted()

    await act(async () => {
      result.current.setValueAsStep('row-1', 'status', 'want')
    })

    expect(remember).not.toHaveBeenCalled()
    expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(false)
  })

  it('no pond remembers nothing even when the record lands', async () => {
    activePond = null
    mockAppendOwnEdit.mockResolvedValue({ id: 'rec-2' } as ChangeLogRecord)
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mounted()

    await act(async () => {
      result.current.setValueAsStep('row-1', 'status', 'weeknight')
    })

    expect(remember).not.toHaveBeenCalled()
  })

  it('a ⌘Z pressed while the drop’s write is still in flight waits for it, then takes the drop’s record', async () => {
    activePond = pondNamed('pond-1')
    // Something already on the stack — if undo ran before the drop's own step
    // landed, this is what it would wrongly take instead.
    sessionUndo.remember({ pondId: 'pond-1', recordIds: ['rec-before'] })
    const write = deferred()
    mockSetProperty.mockReturnValueOnce(write.promise)
    // The append resolves at once once it's reached: only the write is held
    // open, so a version that logs (and remembers) BEFORE the write settles —
    // the bug this test is for — fires immediately instead of waiting.
    mockAppendOwnEdit.mockResolvedValueOnce({ id: 'rec-drop' } as ChangeLogRecord)
    const { result } = await mounted()

    act(() => {
      result.current.setValueAsStep('row-1', 'status', 'weeknight')
    })
    const undo = sessionUndo.undo('pond-1')
    await Promise.resolve()
    await Promise.resolve()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
    expect(mockUndoStep).not.toHaveBeenCalled()

    await act(async () => write.resolve())
    await undo

    expect(mockAppendOwnEdit).toHaveBeenCalled()
    expect(mockUndoStep).toHaveBeenCalledWith(
      expect.anything(),
      { pondId: 'pond-1', recordIds: ['rec-drop'] }
    )
  })
})

describe('useCollectionRows — setValuesAsStep logs both ends as one edit_row', () => {
  const dateSchema: PropertySchema = [
    { id: 'p-start', name: 'start', type: 'date' },
    { id: 'p-end', name: 'end', type: 'date' },
  ]

  async function mountedTrip() {
    const restore = jest.mocked(getPage).getMockImplementation()
    jest.mocked(getPage).mockResolvedValue({
      id: 'col-1',
      parentId: null,
      type: 'page',
      title: 'trips',
      blocks: [],
      order: 0,
      props: { _schema: dateSchema },
    })
    mockGetCollectionRows.mockResolvedValue([
      {
        id: 'row-1',
        title: 'trip',
        type: 'row',
        props: { 'p-start': '2026-10-12', 'p-end': '2026-10-14' },
      },
    ])
    try {
      return await mounted()
    } finally {
      if (restore) jest.mocked(getPage).mockImplementation(restore)
    }
  }

  it('one call with two fields appends one edit_row and remembers that one record', async () => {
    activePond = pondNamed('pond-1')
    mockAppendOwnEdit.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mountedTrip()

    act(() => {
      result.current.setValuesAsStep('row-1', [
        { key: 'p-start', value: '2026-10-19' },
        { key: 'p-end', value: '2026-10-21' },
      ])
    })

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(remember).toHaveBeenCalledTimes(1))
    expect(mockAppendOwnEdit.mock.calls[0][1]).toMatchObject({
      action: 'edit_row',
      before: { values: { 'p-start': '2026-10-12', 'p-end': '2026-10-14' } },
      after: { values: { 'p-start': '2026-10-19', 'p-end': '2026-10-21' } },
    })
    expect(remember.mock.calls[0][0]).toMatchObject({
      pondId: 'pond-1',
      recordIds: ['rec-1'],
    })
    expect(mockSetProperty).toHaveBeenCalledTimes(2)
  })

  it('an empty list appends nothing and remembers nothing', async () => {
    activePond = pondNamed('pond-1')
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mounted()

    await act(async () => {
      result.current.setValuesAsStep('row-1', [])
    })
    await waitOutThePause()

    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
  })

  it('every value already stored appends nothing and remembers nothing', async () => {
    activePond = pondNamed('pond-1')
    const remember = jest.spyOn(sessionUndo, 'remember')
    const { result } = await mountedTrip()

    await act(async () => {
      result.current.setValuesAsStep('row-1', [
        { key: 'p-start', value: '2026-10-12' },
        { key: 'p-end', value: '2026-10-14' },
      ])
    })
    await waitOutThePause()

    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
  })
})
