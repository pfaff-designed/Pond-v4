/**
 * KAN-476 path test — `ShellCommands`' own keydown effect handles ⌘⇧↑,
 * same mocking shape as `shell-commands-breadcrumb-nav.test.tsx` (a static
 * `useCommandPath` mock, swapped per test via a controllable `jest.fn`):
 * gutters→⌘⇧↑ opens roof; roof→⌘⇧↑ opens the pond root; at the pond root,
 * ⌘⇧↑ does nothing; with the caret in an editable field, ⌘⇧↑ does not
 * navigate.
 */
import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { CommandPath } from '@/lib/pages/command-path'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({ blocks: [] }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))

const mockPath = jest.fn<CommandPath, []>()
jest.mock('@/lib/layout/command-path', () => ({
  useCommandPath: () => mockPath(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { workspaceUrl } from '@/lib/pages/nav'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

const pressGoToParent = (target: Document | Element = document) =>
  fireEvent.keyDown(target, { key: 'ArrowUp', metaKey: true, shiftKey: true })

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('KAN-476 path test — ⌘⇧↑ opens the open page’s parent', () => {
  it('on gutters (trail ending in roof), ⌘⇧↑ opens roof', () => {
    mockPath.mockReturnValue({
      glyph: 'ramp',
      trail: [
        { title: 'house', to: { kind: 'page', node: { id: 'house', type: 'page', title: 'house' } } },
        { title: 'roof', to: { kind: 'page', node: { id: 'roof', type: 'page', title: 'roof' } } },
      ],
      current: 'gutters',
      role: null,
    })
    renderShell()

    pressGoToParent()

    expect(push).toHaveBeenCalledWith(workspaceUrl({ id: 'roof', type: 'page', title: 'roof' }))
  })

  it('on roof (trail ending in home), ⌘⇧↑ opens the pond root', () => {
    mockPath.mockReturnValue({
      glyph: 'ramp',
      trail: [{ title: 'life', to: { kind: 'home' } }],
      current: 'roof',
      role: null,
    })
    renderShell()

    pressGoToParent()

    expect(push).toHaveBeenCalledWith(workspaceUrl(null))
  })

  it('at the pond root (empty trail), ⌘⇧↑ does nothing', () => {
    mockPath.mockReturnValue({ glyph: 'ramp', trail: [], current: 'life', role: null })
    renderShell()

    pressGoToParent()

    expect(push).not.toHaveBeenCalled()
  })

  it('with the caret in an editable field, ⌘⇧↑ does not navigate', () => {
    mockPath.mockReturnValue({
      glyph: 'ramp',
      trail: [{ title: 'house', to: { kind: 'page', node: { id: 'house', type: 'page', title: 'house' } } }],
      current: 'roof',
      role: null,
    })
    renderShell()
    const input = document.createElement('input')
    document.body.appendChild(input)

    pressGoToParent(input)

    expect(push).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })
})
