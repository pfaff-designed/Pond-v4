/**
 * KAN-248 fix (`src/__tests__/mark-everywhere.test.ts:1-10` names the gap):
 * every other new suite proves the glyph picker through pure helpers or a
 * Storybook `play` function, never a jest render — so a picker whose cells
 * had no `onClick`, whose search field was never focused and whose arrow
 * keys trapped the caret all passed a green `npx jest` run. This renders the
 * real hosting surface (`RailView`, as `rail-rename.test.tsx` does) and walks
 * PATH_STEPS with `userEvent`: a real click on a mark, a real click on a
 * glyph cell (never a key), and asserts the row's own mark repaints —
 * mirroring `Rail.stories.tsx`'s `GlyphPickHarness`, which plays the part of
 * `Rail()`'s own `marks` memo so the redraw shows with no container.
 */
import React, { useState, type ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail, RailView, type RailNode } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import type { MarkSource } from '@/lib/pages/mark'

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
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

// The RPC boundary only: `sessionUndo` above it runs for real, same as
// `undo-accept-path.test.tsx` — this test proves the pick's remember call and
// the shell chord share one real stack.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

const health = node('health', 'Health')
const scratch = node('scratch', 'Scratchpad', [], null, 1)

/** Plays the part of `Rail()`'s own `marks` memo — `Rail.stories.tsx`'s own `GlyphPickHarness`, in jest. */
function GlyphPickHarness(args: ComponentProps<typeof RailView>) {
  const [marks, setMarks] = useState<ReadonlyMap<string, MarkSource>>(new Map())
  return (
    <RailView
      {...args}
      marks={marks}
      onPickGlyph={(id, glyph) => {
        args.onPickGlyph(id, glyph)
        const target = [health, scratch].find((n) => n.id === id)
        setMarks((prev) =>
          new Map(prev).set(id, {
            id,
            parentId: target?.parentId ?? null,
            title: target?.title ?? id,
            glyph,
          })
        )
      }}
    />
  )
}

function setup() {
  const handlers = {
    onRename: jest.fn(),
    onPickGlyph: jest.fn(),
    onDelete: jest.fn(),
    onAddChild: jest.fn(),
    onSelect: jest.fn(),
  }
  const utils = render(
    <GlyphPickHarness
      tree={[health, scratch]}
      pondName="life"
      selectedId="health"
      expanded={new Set()}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onToggle={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
      {...handlers}
    />
  )
  return { ...utils, ...handlers }
}

const row = (name: string) => screen.getByRole('treeitem', { name: new RegExp(`^${name}`) })
const markOf = (name: string) =>
  within(row(name)).getByRole('button', { name: `change icon for ${name}` })
const iconOf = (name: string) =>
  row(name).querySelector('[data-area-mark] [data-icon]')?.getAttribute('data-icon')

describe('rail — the glyph picker, walked by click and key', () => {
  it('a real click on a mark, then a real click on a cell, repaints the mark', async () => {
    setup()
    const mark = markOf('Health')
    const before = iconOf('Health')

    await userEvent.click(mark)
    const cell = (await within(document.body).findAllByRole('gridcell'))[0]
    const picked = cell.getAttribute('aria-label')
    await userEvent.click(cell)

    expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    expect(mark).toHaveAttribute('aria-expanded', 'false')
    expect(mark).toHaveFocus()
    expect(iconOf('Health')).not.toBe(before)
    expect(within(row('Health')).getByRole('button', { name: 'change icon for Health' })).toBe(
      mark
    )
    expect(picked).toBeTruthy()
  })

  it('typing without touching the search field narrows the library — it focused itself on open', async () => {
    const { onPickGlyph } = setup()
    const mark = markOf('Health')

    await userEvent.click(mark)
    const input = await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    expect(input).toHaveFocus()

    const before = (await within(document.body).findAllByRole('gridcell')).length
    await userEvent.keyboard('fl')
    expect(input).toHaveValue('fl')
    const after = within(document.body).getAllByRole('gridcell').length
    expect(after).toBeLessThan(before)

    await userEvent.keyboard('{Enter}')
    expect(onPickGlyph).toHaveBeenCalledWith('health', expect.any(String))
  })

  it('esc leaves the mark unchanged and returns focus to it', async () => {
    setup()
    const mark = markOf('Health')
    const before = iconOf('Health')

    await userEvent.click(mark)
    await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    await userEvent.keyboard('{Escape}')

    expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    expect(mark).toHaveAttribute('aria-expanded', 'false')
    expect(mark).toHaveFocus()
    expect(iconOf('Health')).toBe(before)
  })
})

const AT = '2026-01-01T00:00:00Z'
const PICK_ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT, glyph: 'heart' },
]

const PICK_POND: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const PICK_PROVIDER_VALUE: PondContextValue = {
  pond: PICK_POND,
  ponds: [PICK_POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
  removePond: () => {},
}

function mountRailAndShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(pagesKey('pond-1'), PICK_ROWS)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PICK_PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

describe('a real glyph pick, then ⌘Z/⇧⌘Z take it back and put it back (KAN-93 path B)', () => {
  beforeEach(() => {
    sessionUndo.clear()
    mockAppendOwnEdit.mockReset().mockResolvedValue({ id: 'glyph-rec-1' })
    jest.mocked(undoStep).mockReset().mockResolvedValue({ outcome: 'done', records: [] })
    jest.mocked(redoStep).mockReset().mockResolvedValue({ outcome: 'done', records: [] })
    onPlatform('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('undoes the picked glyph with ⌘Z and redoes it with ⇧⌘Z, as one step', async () => {
    mountRailAndShell()
    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const automatic = await within(document.body).findByText('automatic')
    await userEvent.click(automatic)

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(true))
    await userEvent.click(document.body)
    await userEvent.keyboard('{Meta>}z{/Meta}')

    expect(jest.mocked(undoStep)).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['glyph-rec-1'],
    })

    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')

    expect(jest.mocked(redoStep)).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['glyph-rec-1'],
    })
  })
})
