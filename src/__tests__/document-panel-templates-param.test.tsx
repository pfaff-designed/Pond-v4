/**
 * KAN-198 — the new-page menu's "from a template" row carries `?templates=1`
 * to the fresh page it makes: `DocumentPanel` reads it once, opens the `/`
 * menu on the page's one block leading with templates (same path a typed
 * `/` takes on a blank page — `document-panel-untouched-path.test.tsx`), and
 * strips the param so a reload never replays it.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import { TEMPLATE_KINDS } from '@/lib/templates/types'

let mockSearchParams = new URLSearchParams()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
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
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

const groupsOf = (menu: HTMLElement) =>
  [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)

/** The rows under the menu's first group — the twelve premade templates, before `yours` or `blocks`. */
const firstGroupRows = (menu: HTMLElement) => {
  const children = [...menu.children]
  const start = children.findIndex((c) => c.getAttribute('data-part') === 'group')
  const rows: Element[] = []
  for (let i = start + 1; i < children.length; i++) {
    if (children[i].getAttribute('data-part') === 'group') break
    rows.push(children[i])
  }
  return rows
}

function renderPanel() {
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: 'parent-1',
    title: '',
    blocks: instantiateTemplate(PREMADE_TEMPLATES.page).blocks,
    props: {},
  })
  mockFetchPages.mockResolvedValue([
    { id: 'parent-1', parentId: null, type: 'page', title: 'recipes', order: 0 },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSearchParams = new URLSearchParams()
})

describe('DocumentPanel — the carried `?templates=1`', () => {
  it('opens the `/` menu on the one block, leading with templates, and strips the param', async () => {
    mockSearchParams = new URLSearchParams('nodeId=page-1&templates=1')
    renderPanel()
    await screen.findByLabelText('Page title')

    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(groupsOf(menu)[0]).toBe('templates')
    const premadeRows = firstGroupRows(menu)
    const labels = premadeRows.map((r) => r.querySelector('[data-part="label"]')!.textContent)
    expect([...labels].sort()).toEqual([...TEMPLATE_KINDS].sort())

    expect(mockReplace).toHaveBeenCalledWith('/workspace?nodeId=page-1')
  })

  it('does nothing when there is no `templates` param', async () => {
    mockSearchParams = new URLSearchParams('nodeId=page-1')
    renderPanel()
    await screen.findByLabelText('Page title')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
