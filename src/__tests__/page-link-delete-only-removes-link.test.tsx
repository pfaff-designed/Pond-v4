/**
 * KAN-415 — removing a page-link block (⌘⌫ or the handle's `remove link`) is an
 * ordinary block delete: `removeBlockAt` (`BlockCanvas.tsx`) only filters the
 * parent's own `blocks` array. There is no page-link-specific delete path, so
 * this is a regression guard, not new production code: the linked page is
 * never deleted/moved, and stays resolvable in the `['pages']` rows cache the
 * rail reads.
 */

import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const childRow: PageRow = {
  id: 'child-professional',
  parent_id: 'page-1',
  type: 'page',
  title: 'professional',
  order: 0,
  updated_at: '2026-01-01',
}
const mockFetchPages = jest.fn().mockResolvedValue([childRow])
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))
const mockDeletePage = jest.fn().mockResolvedValue(undefined)
const mockMovePage = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  createPage: jest.fn(),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
  movePage: (...args: unknown[]) => mockMovePage(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))
const mockAppendOwnEdit = jest.fn().mockResolvedValue({ id: 'record-1' })
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
const link: Block = { id: 'b-link', type: 'page-link', pageId: 'child-professional' }

function Harness({ initial, onChange }: { initial: Block[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="workshop"
      onChange={(next) => {
        onChange(next)
        setBlocks(next)
      }}
    />
  )
}

function renderCanvas() {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={[note, link]} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange, client }
}

async function confirmBlockDelete() {
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete this block?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
}

const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]

const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')
const setPlatform = (value: string) =>
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true })

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([childRow])
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockResolvedValue({ id: 'record-1' })
})
afterEach(() => {
  if (platform) Object.defineProperty(window.navigator, 'platform', platform)
  else delete (window.navigator as { platform?: string }).platform
})

describe('removing a page-link block removes only the link (KAN-415)', () => {
  it('⌘⌫ removes the row; the linked page is never deleted/moved and stays in the rows cache', async () => {
    setPlatform('MacIntel')
    const { onChange, client } = renderCanvas()
    // Resolves via the rows cache first, proving the link is live before the delete.
    await screen.findByRole('link', { name: 'Open professional' })

    const root = document.getElementById('block-b-link')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true })
    await confirmBlockDelete()

    await waitFor(() => expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-note']))
    expect(await screen.findByText('deleted page link ·')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    expect(mockDeletePage).not.toHaveBeenCalled()
    expect(mockMovePage).not.toHaveBeenCalled()
    const rows = client.getQueryData<PageRow[]>(pagesKey(null))
    expect(rows?.some((r) => r.id === 'child-professional')).toBe(true)
  })

  it('the handle menu reads `remove link` and does the same', async () => {
    const user = userEvent.setup()
    const { onChange, client } = renderCanvas()
    await screen.findByRole('link', { name: 'Open professional' })

    const handle = within(document.getElementById('block-b-link')!).getByRole('button', {
      name: /block menu/i,
    })
    await user.click(handle)
    const item = await screen.findByRole('menuitem', { name: 'remove link' })
    expect(screen.queryByRole('menuitem', { name: 'delete' })).not.toBeInTheDocument()
    await user.click(item)
    await confirmBlockDelete()

    await waitFor(() => expect(lastBlocks(onChange).map((b) => b.id)).toEqual(['b-note']))
    expect(mockDeletePage).not.toHaveBeenCalled()
    expect(mockMovePage).not.toHaveBeenCalled()
    const rows = client.getQueryData<PageRow[]>(pagesKey(null))
    expect(rows?.some((r) => r.id === 'child-professional')).toBe(true)
  })
})
