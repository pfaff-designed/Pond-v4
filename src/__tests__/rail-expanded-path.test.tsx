/**
 * KAN-393 person's path + try-to-break-it edges, on the real mounted `Rail`:
 * expand → reload (unmount/remount on the same `localStorage`) → both areas
 * and the open page's ancestors are still expanded with no interaction.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { writeExpandedIds } from '@/lib/rail/expanded-store'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

let nodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? nodeId : null) }),
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
const OFFICE: PageRow = {
  id: 'office',
  parent_id: null,
  type: 'page',
  title: 'Office',
  order: 0,
  updated_at: AT,
}
const DESK: PageRow = {
  id: 'desk',
  parent_id: 'office',
  type: 'page',
  title: 'Desk',
  order: 0,
  updated_at: AT,
}
const ALL_ROWS = [KITCHEN, CABINETS, GARAGE, SHELF, OFFICE, DESK]

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
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe("KAN-393: the rail's path and try-to-break-it edges", () => {
  beforeEach(() => {
    window.localStorage.clear()
    nodeId = null
  })

  it('keeps two expanded areas (plus the open page\'s ancestors) across a reload, with no interaction', async () => {
    nodeId = 'desk'
    const first = mountRail(ALL_ROWS)

    await userEvent.click(screen.getByRole('treeitem', { name: 'Kitchen renovation' }).querySelector('button')!)
    await userEvent.click(screen.getByRole('treeitem', { name: 'Garage' }).querySelector('button')!)
    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'Shelf' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'Desk' })).toBeInTheDocument()

    first.unmount()

    mountRail(ALL_ROWS)

    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'Shelf' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'Desk' })).toBeInTheDocument()
  })

  it('drops a stored id that is no longer in pages, with no crash and no console error', () => {
    writeExpandedIds('pond-1', ['kitchen', 'ghost-page'])
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => mountRail([KITCHEN, CABINETS])).not.toThrow()
    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
    expect(errorSpy).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('still expands/collapses on screen when localStorage.setItem throws, with no error surfaced', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    mountRail([KITCHEN, CABINETS])
    expect(screen.queryByRole('treeitem', { name: 'Cabinets' })).not.toBeInTheDocument()

    const chevron = screen.getByRole('treeitem', { name: 'Kitchen renovation' }).querySelector('button')!
    await userEvent.click(chevron)
    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()

    await userEvent.click(chevron)
    expect(screen.queryByRole('treeitem', { name: 'Cabinets' })).not.toBeInTheDocument()

    expect(errorSpy).not.toHaveBeenCalled()

    setItemSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
