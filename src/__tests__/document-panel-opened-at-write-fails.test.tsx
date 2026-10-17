/**
 * KAN-122: `markOpened`'s fire-and-forget write (`DocumentPanel`'s own-mount
 * effect) has no catch of its own — a failed write would otherwise leave an
 * unhandled rejection, and the optimistic `openedAt` it already applied would
 * disagree with the server forever. The catch instead invalidates the pages
 * key so the next refetch reconciles.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

const mockMarkOpened = jest.fn()
jest.mock('@/lib/pages/nested-page', () => ({
  ...jest.requireActual('@/lib/pages/nested-page'),
  markOpened: (...args: unknown[]) => mockMarkOpened(...args),
}))

const NESTED_PAGE = {
  id: 'page-1',
  title: 'cabinets',
  blocks: [],
  props: { kind: 'nested page', nestedFrom: 'page-0' },
}

function mount() {
  mockGetPage.mockResolvedValue(NESTED_PAGE)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { client }
}

describe('a failed markOpened write invalidates the pages key instead of an unhandled rejection', () => {
  it('invalidates ["pages"] when the write rejects', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockMarkOpened.mockRejectedValue(new Error('network down'))
    const { client } = mount()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')

    await screen.findByLabelText('Page title')
    await waitFor(() => expect(mockMarkOpened).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pagesKey(null) })
    )

    consoleError.mockRestore()
  })
})
