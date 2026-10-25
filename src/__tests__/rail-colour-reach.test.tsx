/**
 * KAN-249 path test (PATH_STEPS 3, 4, 6): the real entry point, walked
 * end to end. Renders the real `Rail` container — not `RailView` alone —
 * and proves a person can open `health`'s mark, see the colour row's four
 * cells with `ink` ringed by default, pick `sage` and watch the rail's own
 * marks and its three nested pages' kind dots retint in the same act while
 * the glass stays open, pick a glyph (closing the glass) so the mark now
 * shows that glyph in sage, then reopen and pick `ink` to put every one of
 * those marks back.
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

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
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

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), ROWS)
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

function healthRow() {
  return screen.getByRole('treeitem', { name: /Health/ })
}

function healthMark() {
  return within(healthRow()).getByRole('button', { name: 'change icon for Health' })
}

function childDot(title: string) {
  return screen.getByRole('treeitem', { name: new RegExp(title) }).querySelector('[data-part="dot"]')!
}

function colourCell(label: string) {
  return within(document.body)
    .getAllByRole('gridcell')
    .find((cell) => cell.getAttribute('aria-label') === label)!
}

describe('KAN-249 path test — the entry point and the live reach', () => {
  it('walks the mark → colour row → sage reach → glyph close → reopen → ink revert', async () => {
    mount()

    // Reveal the nested pages (the caret, not the mark).
    await userEvent.click(healthRow().querySelector('button')!)

    // Step 1-2: the real entry point — click health's own mark.
    await userEvent.click(healthMark())

    // Step 3: the colour row shows under the library, four cells, ink ringed.
    const colourGrid = screen.getByRole('grid', { name: 'colour' })
    const swatchLabels = within(colourGrid)
      .getAllByRole('gridcell')
      .map((cell) => cell.getAttribute('aria-label'))
    expect(swatchLabels).toEqual(['ink', 'sage', 'mist', 'navy'])
    expect(colourCell('ink')).toHaveAttribute('aria-selected', 'true')
    expect(colourCell('sage')).toHaveAttribute('aria-selected', 'false')

    // Step 4: pick sage — glass stays open, the ring moves, the reach lands at once.
    await userEvent.click(colourCell('sage'))

    expect(document.querySelector('[data-part="glass"]')).toBeInTheDocument()
    await waitFor(() => expect(colourCell('sage')).toHaveAttribute('aria-selected', 'true'))
    expect(colourCell('ink')).toHaveAttribute('aria-selected', 'false')
    expect(healthMark().querySelector('[data-area-mark]')).toHaveStyle({
      color: 'var(--mn-area-a)',
    })
    expect(childDot('Workouts')).toHaveStyle({ background: 'var(--mn-area-a)' })
    expect(childDot('Calories')).toHaveStyle({ background: 'var(--mn-area-a)' })
    expect(childDot('Sleep')).toHaveStyle({ background: 'var(--mn-area-a)' })

    // Step 5: with the glass still open, pick a glyph — it closes, in sage.
    await userEvent.click(screen.getByRole('gridcell', { name: 'heart' }))

    expect(document.querySelector('[data-part="glass"]')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(healthMark().querySelector('[data-area-mark]')).toHaveStyle({
        color: 'var(--mn-area-a)',
      })
    )

    // Step 6: reopen and pick ink — every one of those marks returns to ink.
    await userEvent.click(healthMark())
    await userEvent.click(colourCell('ink'))

    await waitFor(() => expect(colourCell('ink')).toHaveAttribute('aria-selected', 'true'))
    expect(colourCell('sage')).toHaveAttribute('aria-selected', 'false')
    expect(healthMark().querySelector('[data-area-mark]')).toHaveStyle({ color: 'var(--mn-text)' })
    expect(childDot('Workouts')).not.toHaveStyle({ background: 'var(--mn-area-a)' })
    expect(childDot('Calories')).not.toHaveStyle({ background: 'var(--mn-area-a)' })
    expect(childDot('Sleep')).not.toHaveStyle({ background: 'var(--mn-area-a)' })
  })
})
