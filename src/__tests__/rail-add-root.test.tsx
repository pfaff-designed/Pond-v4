/**
 * KAN-490: the ＋ "new root folder" row creates a top-level page with
 * `props.root`, deduped against every current top-level title (the home
 * row's own title included, since `fetchPages` strips it from the tree
 * cache), opens inline rename on the new row with its name selected, and
 * does NOT navigate into it — unlike the existing child-add flow.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { createPage } from '@/lib/pages/client'
import { appendChildLinkUnder } from '@/lib/pages/child-links'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

const routerPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
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

const AT = '2026-01-01T00:00:00Z'
let mockPagesTable: PageRow[] = []
let mockNextId = 1

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(
    async (
      _sb: unknown,
      _uid: string,
      input: { parentId?: string | null; title?: string; props?: Record<string, unknown> }
    ) => {
      const id = `new-${mockNextId++}`
      const title = input.title ?? 'Untitled'
      mockPagesTable.push({
        id,
        parent_id: input.parentId ?? null,
        type: 'page',
        title,
        order: mockPagesTable.length,
        updated_at: AT,
        props: input.props ?? null,
      })
      return { id, title, type: 'page', props: input.props ?? {} }
    }
  ),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => mockPagesTable.map((r) => ({ ...r }))),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
  trashPageUnlinked: jest.fn().mockResolvedValue(undefined),
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
  patchPond: () => {},
}

function mount(rows: PageRow[]) {
  mockPagesTable = rows.map((r) => ({ ...r }))
  mockNextId = 1
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

describe('rail — the ＋ row creates a new root (KAN-490)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates "Untitled 2" (the home row already holds "Untitled"), opens rename with its name selected, and does not navigate or append a child link', async () => {
    mount([])

    // Wait for `useHomePage` to resolve — the root row reads its title
    // ("Untitled"), not the pond's own name ("Studio") — before clicking, so
    // the dedupe below sees the home row's title as a taken sibling.
    await screen.findByRole('treeitem', { name: 'Untitled' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'new root folder' }))
    })

    const row = await screen.findByRole('treeitem', { name: 'Untitled 2' })
    expect(row).toBeInTheDocument()

    // createPage was called with the pre-deduped title and the root flag —
    // never as a child of the home page.
    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ parentId: null, title: 'Untitled 2', props: { root: true } })
    )

    const field = screen.getByRole('textbox', { name: 'rename Untitled 2' }) as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(field))
    expect(field.value).toBe('Untitled 2')
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('Untitled 2'.length)

    // No navigation into the new root, and no page-link block on the home page.
    expect(routerPush).not.toHaveBeenCalled()
    expect(appendChildLinkUnder).not.toHaveBeenCalled()
  })
})
