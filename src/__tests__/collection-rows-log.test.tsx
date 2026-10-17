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
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Pond } from '@/lib/pond/client'
import type { PropertySchema } from '@/lib/properties/schema'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
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
  activePond = null
  mockSetProperty.mockResolvedValue(undefined)
  mockUpdateTitle.mockResolvedValue(undefined)
  mockGetCollectionRows.mockResolvedValue([ROW])
  mockAppendOwnEdit.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
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
