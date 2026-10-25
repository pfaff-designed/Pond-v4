/**
 * KAN-393: the rail's `expanded` state persists per pond to `localStorage`
 * (board `Pond 08 Edges` 8f, "What you open stays open") so a reload keeps
 * what was open.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { readExpandedIds, writeExpandedIds } from '@/lib/rail/expanded-store'
import { createPage } from '@/lib/pages/client'
import { appendChildLinkUnder } from '@/lib/pages/child-links'
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

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
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

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

const AT = '2026-01-01T00:00:00Z'
const KITCHEN: PageRow = {
  id: 'kitchen',
  parent_id: null,
  type: 'page',
  title: 'Kitchen renovation',
  order: 0,
  updated_at: AT,
}
const CABINETS: PageRow = {
  id: 'cabinets',
  parent_id: 'kitchen',
  type: 'page',
  title: 'Cabinets',
  order: 0,
  updated_at: AT,
}

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

function mountRail(rows: PageRow[]) {
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
  return client
}

describe('the rail persists expanded rows per pond (KAN-393)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => jest.clearAllMocks())

  it('writes the toggled id to the current pond store on a chevron click', async () => {
    mountRail([KITCHEN, CABINETS])

    const row = screen.getByRole('treeitem', { name: 'Kitchen renovation' })
    await userEvent.click(row.querySelector('button')!)

    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])
  })

  it('renders a stored row as expanded on a cold mount, with no interaction', () => {
    writeExpandedIds('pond-1', ['kitchen'])

    mountRail([KITCHEN, CABINETS])

    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
  })

  it('keeps each pond toggling its own store when the pond switches', async () => {
    const POND_B: Pond = { ...POND, id: 'pond-2' }
    const GARAGE: PageRow = {
      id: 'garage',
      parent_id: null,
      type: 'page',
      title: 'Garage',
      order: 0,
      updated_at: AT,
    }
    const SHELF: PageRow = {
      id: 'shelf',
      parent_id: 'garage',
      type: 'page',
      title: 'Shelf',
      order: 0,
      updated_at: AT,
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(pagesKey('pond-1'), [KITCHEN, CABINETS])
    client.setQueryData(pagesKey('pond-2'), [GARAGE, SHELF])

    const withPond = (pond: Pond) => (
      <QueryClientProvider client={client}>
        <PondContext.Provider value={{ ...PROVIDER_VALUE, pond }}>
          <DeletionUndoProvider>
            <Rail />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )

    const { rerender } = render(withPond(POND))
    await userEvent.click(screen.getByRole('treeitem', { name: 'Kitchen renovation' }).querySelector('button')!)
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])

    rerender(withPond(POND_B))
    await userEvent.click(screen.getByRole('treeitem', { name: 'Garage' }).querySelector('button')!)
    expect(readExpandedIds('pond-2')).toEqual(['garage'])
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])

    rerender(withPond(POND))
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])
    expect(readExpandedIds('pond-2')).toEqual(['garage'])
    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
  })

  it("clears the current pond's store when Life's caret collapses everything", async () => {
    mountRail([KITCHEN, CABINETS])

    await userEvent.click(screen.getByRole('treeitem', { name: 'Kitchen renovation' }).querySelector('button')!)
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])

    await userEvent.click(screen.getByRole('treeitem', { name: 'life' }).querySelector('button')!)
    expect(readExpandedIds('pond-1')).toEqual([])
  })

  it("does not overwrite pond A's store when the pond switches before an async ＋ resolves", async () => {
    const POND_B: Pond = { ...POND, id: 'pond-2' }
    const GARAGE: PageRow = {
      id: 'garage',
      parent_id: null,
      type: 'page',
      title: 'Garage',
      order: 0,
      updated_at: AT,
    }
    const SHELF: PageRow = {
      id: 'shelf',
      parent_id: 'garage',
      type: 'page',
      title: 'Shelf',
      order: 0,
      updated_at: AT,
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(pagesKey('pond-1'), [KITCHEN, CABINETS])
    client.setQueryData(pagesKey('pond-2'), [GARAGE, SHELF])

    const withPond = (pond: Pond) => (
      <QueryClientProvider client={client}>
        <PondContext.Provider value={{ ...PROVIDER_VALUE, pond }}>
          <DeletionUndoProvider>
            <Rail />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )

    let resolveCreatePage: (page: { id: string; title: string }) => void = () => {}
    ;(createPage as jest.Mock).mockImplementation(
      () => new Promise((resolve) => (resolveCreatePage = resolve))
    )

    const { rerender } = render(withPond(POND))
    await userEvent.click(screen.getByRole('treeitem', { name: 'Kitchen renovation' }).querySelector('button')!)
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])

    // Press ＋ on the area — this starts the async createPage call, which stays
    // pending until resolveCreatePage is called below.
    await userEvent.click(screen.getByRole('button', { name: 'Add sub-page to Kitchen renovation' }))
    await screen.findByText('new page in Kitchen renovation')
    await userEvent.click(screen.getByRole('menuitem', { name: /^page/ }))

    // Switch pond while that ＋ is still in flight, and expand something on
    // the new pond — so a leaked write lands a visibly wrong value, not one
    // that happens to coincide with pond A's own.
    rerender(withPond(POND_B))
    await userEvent.click(screen.getByRole('treeitem', { name: 'Garage' }).querySelector('button')!)
    expect(readExpandedIds('pond-2')).toEqual(['garage'])

    resolveCreatePage({ id: 'new-page', title: '' })
    await waitFor(() => expect(appendChildLinkUnder).toHaveBeenCalledTimes(1))

    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])
  })
})
