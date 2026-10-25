/**
 * KAN-249 (4/7): `Rail.tsx`'s `handlePickColour` wires a colour pick to a
 * write — `setAreaRole`, mirroring `handlePickGlyph` (`rail-glyph-change-log.
 * test.tsx`). Proves the real container writes the role, logs exactly one
 * `edit_area_role` own-edit record per pick, skips the log on a no-op pick,
 * and rolls back + notifies on a failed write.
 */
import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

const mockSetAreaRole = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: (...args: unknown[]) => mockSetAreaRole(...args),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

const mockAppendOwnEdit = jest.fn().mockResolvedValue({})
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
]
const ROWS_WITH_CHILDREN: PageRow[] = [
  ...ROWS,
  { id: 'workouts', parent_id: 'health', type: 'page', title: 'Workouts', order: 0, updated_at: AT },
  { id: 'calories', parent_id: 'health', type: 'page', title: 'Calories', order: 1, updated_at: AT },
  { id: 'sleep', parent_id: 'health', type: 'page', title: 'Sleep', order: 2, updated_at: AT },
]

const POND: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
  removePond: () => {},
}

function mount(rows: PageRow[] = ROWS) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), rows)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

async function openHealthPicker() {
  const row = screen.getByRole('treeitem', { name: /Health/ })
  const mark = within(row).getByRole('button', { name: 'change icon for Health' })
  await userEvent.click(mark)
  return mark
}

function colourCell(label: string) {
  return within(document.body)
    .getAllByRole('gridcell')
    .find((cell) => cell.getAttribute('aria-label') === label)!
}

beforeEach(() => {
  mockSetAreaRole.mockClear()
  mockAppendOwnEdit.mockClear()
  mockRemember.mockClear()
})

describe('handlePickColour — the write and the change-log record', () => {
  it('writes the role and appends one edit_area_role record, before null after area-a', async () => {
    mount()
    await openHealthPicker()
    const sage = colourCell('sage')

    await userEvent.click(sage)

    await waitFor(() => expect(mockSetAreaRole).toHaveBeenCalledWith(expect.anything(), 'health', 'area-a'))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(mockAppendOwnEdit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        pondId: 'pond-1',
        action: 'edit_area_role',
        targetPageId: 'health',
        before: null,
        after: 'area-a',
      })
    )

    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })
    expect(mark.querySelector('[data-area-mark]')).toHaveStyle({ color: 'var(--mn-area-a)' })
  })

  it('appends nothing when the pick matches the already-current colour', async () => {
    mount()
    await openHealthPicker()
    const ink = colourCell('ink')

    await userEvent.click(ink)

    await waitFor(() => expect(mockSetAreaRole).toHaveBeenCalledWith(expect.anything(), 'health', null))
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()
  })

  it('rolls the role back and notifies on a failed write', async () => {
    mockSetAreaRole.mockRejectedValueOnce(new Error('nope'))
    mount()
    await openHealthPicker()
    const sage = colourCell('sage')

    await userEvent.click(sage)

    await waitFor(() => expect(mockSetAreaRole).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Couldn't change the colour for "Health"/)).toBeInTheDocument()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })
    expect(mark.querySelector('[data-area-mark]')).toHaveStyle({ color: 'var(--mn-text)' })
  })

  it('remembers the pick as one undo step once the record lands', async () => {
    mockAppendOwnEdit.mockResolvedValueOnce({ id: 'record-1' })
    mount()
    await openHealthPicker()
    const sage = colourCell('sage')

    await userEvent.click(sage)

    await waitFor(() => expect(mockRemember).toHaveBeenCalledTimes(1))
    expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['record-1'] })
  })
})

describe('the open picker stays live', () => {
  it('a colour pick redraws the glass without closing it, and reaches child rows in the same act', async () => {
    mount(ROWS_WITH_CHILDREN)
    const healthRow = screen.getByRole('treeitem', { name: /Health/ })
    await userEvent.click(healthRow.querySelector('button')!) // the caret — reveal the children
    await openHealthPicker()

    const sage = colourCell('sage')
    const ink = colourCell('ink')
    const heart = colourCell('heart')
    const automaticMark = () => document.querySelector('[data-part="automatic"] [data-area-mark]')!
    const workoutsDot = () =>
      screen.getByRole('treeitem', { name: /Workouts/ }).querySelector('[data-part="dot"]')!

    await userEvent.click(sage)

    expect(document.querySelector('[data-part="glass"]')).toBeInTheDocument()
    await waitFor(() => expect(sage).toHaveAttribute('aria-selected', 'true'))
    expect(ink).toHaveAttribute('aria-selected', 'false')
    expect(heart).toHaveStyle({ color: 'var(--mn-area-a)' })
    expect(automaticMark()).toHaveStyle({ color: 'var(--mn-area-a)' })
    expect(workoutsDot()).toHaveStyle({ background: 'var(--mn-area-a)' })

    await userEvent.click(ink)

    await waitFor(() => expect(ink).toHaveAttribute('aria-selected', 'true'))
    expect(sage).toHaveAttribute('aria-selected', 'false')
    expect(heart).not.toHaveStyle({ color: 'var(--mn-area-a)' })
    expect(automaticMark()).toHaveStyle({ color: 'var(--mn-text)' })
    expect(workoutsDot()).not.toHaveStyle({ background: 'var(--mn-area-a)' })
  })
})
