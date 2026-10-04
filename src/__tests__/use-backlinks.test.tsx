/**
 * Backlink compute seam (#39, #20 second-half slice B) — `useBacklinks`. Integration
 * over the shared caches: discovery reads the workspace list (`listPages`) for relation
 * schemas, then each source collection's rows (`getCollectionRows`), and derives the
 * backlink groups. The point these tests defend is the DERIVED-not-stored invariant:
 * add a forward link and the backlink appears; remove it and the backlink is simply not
 * computed on the next read — no stale mirror.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useBacklinks } from '@/lib/modules/view/use-backlinks'
import { SCHEMA_KEY, type PropertySchema } from '@/lib/properties/schema'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}))

const mockGetCollectionRows = jest.fn()
const mockListPages = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getCollectionRows: (...a: unknown[]) => mockGetCollectionRows(...a),
  listPages: (...a: unknown[]) => mockListPages(...a),
}))

const TASKS_SCHEMA: PropertySchema = [
  { id: 'p-title', name: 'Title', type: 'text' },
  { id: 'p-project', name: 'Project', type: 'relation', target: 'col-projects' },
  { id: 'p-related', name: 'Related', type: 'relation' }, // untargeted
]

function collectionPage(id: string, title: string, schema: PropertySchema): PondPage {
  return {
    id,
    parentId: null,
    type: 'page',
    title,
    blocks: [],
    props: { [SCHEMA_KEY]: schema },
    order: 0,
  }
}

function row(id: string, title: string, props: Record<string, unknown>): PondPage {
  return { id, parentId: 'col-tasks', type: 'row', title, blocks: [], props, order: 0 }
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  mockGetCollectionRows.mockReset()
  mockListPages.mockReset()
})

describe('useBacklinks — forward link → backlink appears', () => {
  it('a task whose Project relation contains the target shows up under the source property', async () => {
    mockListPages.mockResolvedValue([
      collectionPage('col-tasks', 'Tasks', TASKS_SCHEMA),
      collectionPage('col-projects', 'Projects', [{ id: 'p-name', name: 'Name', type: 'text' }]),
    ])
    mockGetCollectionRows.mockImplementation((_sb, _uid, collectionId: string) =>
      Promise.resolve(
        collectionId === 'col-tasks'
          ? [
              row('task-1', 'Fix bug', { 'p-project': ['proj-1'] }),
              row('task-2', 'Unrelated', { 'p-project': ['proj-9'] }),
            ]
          : []
      )
    )

    const { result } = renderHook(() => useBacklinks('proj-1', 'col-projects'), {
      wrapper: wrapper(freshClient()),
    })

    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0))
    const projectGroup = result.current.groups.find((g) => g.propertyId === 'p-project')
    expect(projectGroup).toMatchObject({ sourceCollectionTitle: 'Tasks', propertyName: 'Project' })
    expect(projectGroup?.rows).toEqual([{ id: 'task-1', title: 'Fix bug' }])
  })

  it('an untargeted relation that links the target also backlinks (any-page)', async () => {
    mockListPages.mockResolvedValue([collectionPage('col-tasks', 'Tasks', TASKS_SCHEMA)])
    mockGetCollectionRows.mockResolvedValue([
      row('task-1', 'Loose link', { 'p-related': ['proj-1'] }),
    ])

    const { result } = renderHook(() => useBacklinks('proj-1', 'col-projects'), {
      wrapper: wrapper(freshClient()),
    })

    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0))
    expect(result.current.groups.some((g) => g.propertyId === 'p-related')).toBe(true)
  })
})

describe('useBacklinks — unlink → backlink disappears (derived, no stale mirror)', () => {
  it('a source whose relation no longer contains the target yields no group', async () => {
    mockListPages.mockResolvedValue([collectionPage('col-tasks', 'Tasks', TASKS_SCHEMA)])
    // The forward link was removed: the task now points elsewhere, not at proj-1.
    mockGetCollectionRows.mockResolvedValue([row('task-1', 'Fix bug', { 'p-project': ['proj-9'] })])

    const { result } = renderHook(() => useBacklinks('proj-1', 'col-projects'), {
      wrapper: wrapper(freshClient()),
    })

    // Let the queries settle, then assert nothing links here.
    await waitFor(() => expect(mockGetCollectionRows).toHaveBeenCalled())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.groups).toEqual([])
  })
})
