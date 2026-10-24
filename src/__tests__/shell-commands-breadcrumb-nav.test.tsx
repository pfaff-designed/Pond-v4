/**
 * KAN-472: `ShellCommands` wires `PondCommand`'s `onNavigate` to the one
 * navigation seam (`openWorkspaceUrl` + `workspaceUrl`, `@/lib/pages/nav`) —
 * the same seam every other page-opening site in this file already uses.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'budget' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({ blocks: [] }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([
    {
      id: 'budget',
      title: 'budget',
      parent_id: 'house',
      type: 'page',
      order: 0,
      updated_at: '',
    },
  ]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))
jest.mock('@/lib/layout/command-path', () => ({
  useCommandPath: () => ({
    glyph: 'ramp',
    trail: [
      { title: 'house', to: { kind: 'page', node: { id: 'house', type: 'page', title: 'house' } } },
    ],
    current: 'budget',
    role: null,
  }),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { workspaceUrl } from '@/lib/pages/nav'

const renderShell = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ShellCommands />
    </QueryClientProvider>
  )

afterEach(() => jest.clearAllMocks())

describe('ShellCommands — a breadcrumb ancestor link navigates through openWorkspaceUrl', () => {
  it('clicking "house" drives router.push to its workspaceUrl, and never opens the palette', () => {
    renderShell()
    const link = screen.getByRole('link', { name: 'house' })
    expect(link).toHaveAttribute(
      'href',
      workspaceUrl({ id: 'house', type: 'page', title: 'house' })
    )

    fireEvent.click(link)

    expect(push).toHaveBeenCalledWith(workspaceUrl({ id: 'house', type: 'page', title: 'house' }))
    expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()
  })
})
