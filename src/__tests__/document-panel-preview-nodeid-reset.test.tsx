/**
 * KAN-131 fix: `BlockCanvas` never calls `onPreviewNameChange` (DocumentPanel's
 * `setPreviewName`) from its own render-phase `pageId` reset — that would be a
 * parent `setState` during a different component's render, which React
 * rejects. `DocumentPanel` clears `previewName` itself, on its own `nodeId`
 * change, with the same render-phase pattern. `block-canvas-blank.test.tsx`
 * covers the `BlockCanvas` half (the outline clears, no cross-component render
 * warning); this covers the other half — the eyebrow's `preview — {name}`
 * line actually drops once the person navigates away mid-preview.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PondTemplate } from '@/lib/templates/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

let currentNodeId: string | null = 'page-1'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

const mockListTemplates = jest.fn()
jest.mock('@/lib/templates/client', () => ({
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const PAGES: Record<string, Record<string, unknown>> = {
  'page-1': {
    id: 'page-1',
    parentId: null,
    type: 'page',
    title: '',
    blocks: [{ id: 'b1', type: 'text', content: '' }],
  },
  'page-2': {
    id: 'page-2',
    parentId: null,
    type: 'page',
    title: 'second page',
    blocks: [{ id: 'b2', type: 'text', content: 'already here' }],
  },
}
const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  saveBlocks: jest.fn().mockResolvedValue(undefined),
  saveProps: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
  createPageWriter: jest.fn(() => jest.fn().mockResolvedValue(undefined)),
}))

const YOURS_TEMPLATE: PondTemplate = {
  id: 'tpl-9',
  name: 'recipe',
  kind: 'notes',
  blocks: [{ id: 'orig-1', type: 'text', content: 'already written' } as Block],
  origin: 'yours',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  currentNodeId = 'page-1'
  mockGetPage.mockImplementation((_: unknown, id: string) => Promise.resolve(PAGES[id] ?? null))
  mockListTemplates.mockResolvedValue([YOURS_TEMPLATE])
})

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rendered = render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { client, ...rendered }
}

it("KAN-131 fix: leaving the page mid-preview (a nodeId change) drops the eyebrow's `preview — {name}` line", async () => {
  const user = userEvent.setup()
  const { client, rerender } = renderPanel()

  writeInTextBlock(await findTextBlock(), '/')
  await screen.findByRole('listbox', { name: 'blocks' })
  await screen.findByText('recipe')
  await user.keyboard('{ArrowRight}')
  await screen.findByText('preview — recipe')

  // The person navigates to a different page — `DocumentPanel` stays
  // mounted across `?nodeId` changes, so this is a render with a new
  // `nodeId`, not a remount.
  currentNodeId = 'page-2'
  rerender(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

  await waitFor(() => expect(screen.getByLabelText('Page title')).toHaveValue('second page'))
  expect(screen.queryByText(/^preview — /)).toBeNull()
})
