/**
 * KAN-491: the home root renames and deletes from the rail, including when it
 * is the last root. The × and the rename field are the same controls every
 * other row uses; hiding the row is what leaves the empty hint and the ＋.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail, RailView, type RailNode } from '@/components/organisms/Rail'
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

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Untitled', blocks: [] }),
}))

const POND: Pond = {
  id: 'pond-1',
  name: 'Studio',
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
}

function viewProps(overrides: Partial<React.ComponentProps<typeof RailView>> = {}) {
  return {
    tree: [] as RailNode[],
    pondName: 'Studio',
    rootTitle: 'Untitled',
    selectedId: null,
    expanded: new Set<string>(),
    lifeExpanded: false,
    busyId: null,
    isLoading: false,
    isEmpty: true,
    onSelect: jest.fn(),
    onToggle: jest.fn(),
    onAddChild: jest.fn(),
    onDelete: jest.fn(),
    onRename: jest.fn(),
    onPickGlyph: jest.fn(),
    onLife: jest.fn(),
    onToggleLife: jest.fn(),
    onOpenDatabases: jest.fn(),
    canDrop: () => true,
    onMove: jest.fn(),
    ...overrides,
  }
}

describe('KAN-491 home root', () => {
  it('offers delete and rename on the home root, and hides it when asked', () => {
    const onDelete = jest.fn()
    const onRename = jest.fn()
    const { rerender } = render(<RailView {...viewProps({ onDelete, onRename })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Untitled' }))
    expect(onDelete).toHaveBeenCalledWith('__life__')

    fireEvent.doubleClick(screen.getByRole('treeitem', { name: /Untitled/ }))
    const field = screen.getByRole('textbox')
    fireEvent.change(field, { target: { value: 'Studio notes' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('__life__', 'Studio notes')

    rerender(<RailView {...viewProps({ showHomeRoot: false })} />)
    expect(screen.queryByRole('treeitem', { name: /Untitled/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('no pages yet')
    expect(screen.getByRole('button', { name: 'new root folder' })).toBeInTheDocument()
  })

  it('deletes the last root and leaves the empty rail', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(pagesKey('pond-1'), [] as PageRow[])
    render(
      <QueryClientProvider client={client}>
        <PondContext.Provider value={PROVIDER_VALUE}>
          <DeletionUndoProvider>
            <Rail />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )

    const root = await screen.findByRole('treeitem', { name: /Untitled/ })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Untitled' }))

    expect(root).not.toBeInTheDocument()
    expect(screen.getByText(/no pages yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'new root folder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})
