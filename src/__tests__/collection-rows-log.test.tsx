/**
 * Record edits are your own edits too (`Pond 06.15` 6o frame 1: "08:47 added
 * chickpeas, harissa · recipes · you · accepted"). A cell, a title or a new row
 * writes through at once, and the change log gets one `accepted` record per
 * pause — not one per keystroke — filed against the collection page.
 */

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCollectionRows } from '@/lib/modules/view/use-collection-rows'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

const mockSetProperty = jest.fn()
const mockUpdateTitle = jest.fn()
const mockCreatePage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async () => ({
    id: 'col-1',
    title: 'recipes',
    props: { _schema: [{ id: 'status', name: 'status', type: 'text' }] },
    blocks: [],
  })),
  getCollectionRows: jest.fn(async () => [
    { id: 'row-1', title: 'dal', type: 'row', props: { status: 'want' } },
  ]),
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

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCollectionRows('col-1'), { wrapper })
}

async function mounted() {
  const hook = mount()
  await waitFor(() => expect(hook.result.current.rows).toHaveLength(1))
  return hook
}

/** Long enough for one pause to close, short enough to stay fast. */
const afterThePause = { timeout: 2000 }

beforeEach(() => {
  jest.clearAllMocks()
  mockSetProperty.mockResolvedValue(undefined)
  mockUpdateTitle.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
})

describe('useCollectionRows — record edits are logged by pause', () => {
  it('a run of keystrokes in one cell is one record, filed against the collection', async () => {
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
      pondId: null,
      action: 'edit_row',
      targetPageId: 'col-1',
      before: { id: 'row-1', title: 'dal', values: { status: 'want' } },
      after: { id: 'row-1', title: 'dal', values: { status: 'weeknight' } },
    })
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

  it('adding a row and naming it in one pause is one "added" record', async () => {
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
      after: { id: 'row-2', title: 'chickpeas, harissa', values: {} },
    })
  })

  it('a value typed and then typed back is no change, and no record', async () => {
    const { result } = await mounted()

    act(() => {
      result.current.setValue('row-1', 'status', 'wan')
      result.current.setValue('row-1', 'status', 'want')
    })

    await new Promise((r) => setTimeout(r, 900))
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('a write that did not land is not logged', async () => {
    mockSetProperty.mockRejectedValueOnce(new Error('rls'))
    const { result } = await mounted()

    act(() => result.current.setValue('row-1', 'status', 'weeknight'))

    await new Promise((r) => setTimeout(r, 900))
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
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
    expect(result.current.rows[0].values).toEqual({ status: 'weeknight' })
    spy.mockRestore()
  })
})
