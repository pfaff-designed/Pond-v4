/**
 * KAN-449: three more page-open sites now route through `openWorkspaceUrl` —
 * on `/workspace` each must `pushState` shallowly, never `router.push`. No
 * test file covered any of these sites' navigation before this one.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageMentioned } from '@/components/organisms/PageProvenance'
import { RelationValueField } from '@/components/organisms/RelationValueField'
import { BacklinksPanel } from '@/components/organisms/BacklinksPanel'
import { workspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'
import type { PropertyDef } from '@/lib/properties/schema'
import type { BacklinkGroup } from '@/lib/modules/view/compute-backlinks'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const GROUPS: BacklinkGroup[] = [
  {
    sourceCollectionId: 'col-tasks',
    sourceCollectionTitle: 'Tasks',
    propertyId: 'p-project',
    propertyName: 'Project',
    rows: [{ id: 'row-bench', title: 'Sand the bench' }],
  },
]
jest.mock('@/lib/modules/view/use-backlinks', () => ({
  useBacklinks: () => ({ groups: GROUPS, loading: false }),
}))

beforeEach(() => {
  push.mockClear()
  window.history.replaceState({}, '', WORKSPACE_PATH)
})

describe('PageMentioned — open sites shallow nav (KAN-449)', () => {
  it('clicking a resolved mention pushes history shallowly, never router.push', () => {
    render(
      <PageMentioned
        props={{ mentioned: [{ title: 'kitchen renovation', ref: 'page-1', note: '' }] }}
      />
    )
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    fireEvent.click(screen.getByRole('button', { name: 'kitchen renovation' }))

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'page-1', type: 'page', title: 'kitchen renovation' })
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})

describe('RelationValueField — open sites shallow nav (KAN-449)', () => {
  it('opening a linked chip pushes history shallowly, never router.push', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(
      ['rows', 'coll-projects'],
      [{ id: 'r1', title: 'Apollo', type: 'row', parentId: 'coll-projects', blocks: [], order: 0, props: {} }]
    )
    const def: PropertyDef = { id: 'p-rel', name: 'Projects', type: 'relation', target: 'coll-projects' }
    render(
      <QueryClientProvider client={client}>
        <RelationValueField def={def} value={['r1']} editable={false} onChange={() => {}} />
      </QueryClientProvider>
    )
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    fireEvent.click(screen.getByRole('button', { name: 'Apollo' }))

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'r1', type: 'page', title: 'Apollo' })
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})

describe('BacklinksPanel — open sites shallow nav (KAN-449)', () => {
  it('opening a backlink chip pushes history shallowly, never router.push', () => {
    render(<BacklinksPanel targetId="page-1" targetCollectionId={null} />)
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    fireEvent.click(screen.getByRole('button', { name: 'Sand the bench' }))

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'row-bench', type: 'page', title: 'Sand the bench' })
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})
