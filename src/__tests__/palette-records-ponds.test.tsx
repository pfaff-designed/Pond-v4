/**
 * The ⌘K palette in the shell, with records and ponds: what the person
 * types reaches the data layer once, debounced and pond-scoped; the answer lists
 * under `records` between `pages` and `actions`; ↵ opens the record's page; other
 * ponds list under `ponds` and switch; `new pond “q”` opens the New pond sheet.
 * The data layer — `searchRecords`, the page tree, the pond list — is mocked, as
 * the other shell suites do.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ marker: 'client' }) }))
jest.mock('@/lib/pages/client', () => ({ createPage: jest.fn(), getPage: jest.fn() }))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([
    {
      id: 'plan',
      title: 'cabinet plan',
      parent_id: null,
      type: 'page',
      order: 0,
      updated_at: '',
    },
  ]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/palette-records', () => ({
  ...jest.requireActual('@/lib/pages/palette-records'),
  searchRecords: jest.fn(),
}))

const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const NOISE = { id: 'p-noise', name: 'make noise', glyph: 'lightning-03', theme: 'ink', order: 1 }
const GARDEN = {
  id: 'p-garden',
  name: 'garden club',
  glyph: 'leaf-01',
  theme: 'paper',
  order: 2,
  lastPageId: 'n-77',
}
jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'p-life',
  usePond: () => ({ pond: LIFE, ponds: [LIFE, NOISE, GARDEN], addPond: jest.fn() }),
}))
jest.mock('@/lib/pond/client', () => ({ createPond: jest.fn(), listPonds: jest.fn() }))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { searchRecords } from '@/lib/pages/palette-records'

const search = searchRecords as jest.Mock
const QUOTE = {
  id: 'r1',
  label: 'cabinet quote',
  kind: 'record',
  sub: 'tasks · vendor acme cabinets',
}

const renderShell = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

async function openAndType(value: string) {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value } })
  return input
}
const groups = () => [...document.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
// The hit is its own span, so an option's name reads `cab inet quote`.
const rowNamed = (name: RegExp) => screen.findByRole('option', { name })

beforeEach(() => {
  push.mockClear()
  search.mockReset().mockResolvedValue([QUOTE])
})

describe('records', () => {
  it('list under `records`, between `pages` and `actions`, with the sub-line the search wrote', async () => {
    renderShell()
    await openAndType('cab')
    const row = await rowNamed(/cab inet quote/)
    expect(groups()).toEqual(['pages', 'records', 'actions'])
    expect(within(row).getByText('tasks · vendor acme cabinets')).toBeInTheDocument()
    expect(row.querySelector('[data-part="icon"] svg')).not.toBeNull()
  })

  it('are searched once per settled query, in the active pond — typing fast does not search each letter', async () => {
    renderShell()
    const input = await openAndType('c')
    fireEvent.change(input, { target: { value: 'ca' } })
    fireEvent.change(input, { target: { value: 'cab' } })
    await rowNamed(/cab inet quote/)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith({ marker: 'client' }, 'p-life', 'cab')
  })

  it('are not searched for one letter, or for a `>` actions-only line', async () => {
    renderShell()
    const input = await openAndType('c')
    await new Promise((r) => setTimeout(r, 350))
    fireEvent.change(input, { target: { value: '> new' } })
    await new Promise((r) => setTimeout(r, 350))
    expect(search).not.toHaveBeenCalled()
  })

  it('↵ opens the record’s own page, in this pond', async () => {
    renderShell()
    const input = await openAndType('cab')
    await rowNamed(/cab inet quote/)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledTimes(1)
    const href = push.mock.calls[0][0] as string
    expect(href).toContain('nodeType=row')
    expect(href).toContain('nodeId=r1')
  })

  it('a search that has not answered lists none — and a stale answer is not shown under a new query', async () => {
    search.mockImplementation(() => new Promise(() => {}))
    renderShell()
    await openAndType('cab')
    await new Promise((r) => setTimeout(r, 350))
    expect(screen.queryByText('cabinet quote')).toBeNull()
    expect(groups()).toEqual(['pages', 'actions'])
  })
})

describe('ponds', () => {
  it('another pond lists under `ponds`, above `pages in life`, as `pond · switch` with no ⌘n hint', async () => {
    renderShell()
    await openAndType('make')
    const row = await rowNamed(/make noise/)
    expect(groups()).toEqual(['ponds', 'actions'])
    expect(within(row).getByText('pond · switch')).toBeInTheDocument()
    fireEvent.pointerMove(screen.getAllByRole('option')[2])
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true')
    expect(row.querySelector('[data-part="hint"]')).toBeNull()
    expect(row.textContent).not.toMatch(/⌘/)
  })

  it('the pond you are in is not offered', async () => {
    renderShell()
    await openAndType('lif')
    await screen.findByRole('combobox', { name: 'command palette' })
    expect(screen.queryByRole('option', { name: /^life/ })).toBeNull()
    expect(groups()).not.toContain('ponds')
  })

  it('↵ on a pond switches to it', async () => {
    renderShell()
    const input = await openAndType('make')
    await rowNamed(/make noise/)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/workspace?pond=p-noise')
  })

  it('↵ on a pond with a remembered page carries it as nodeId=', async () => {
    renderShell()
    const input = await openAndType('garden')
    await rowNamed(/garden club/)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/workspace?pond=p-garden&nodeId=n-77')
  })

  it('`new pond “q”` opens the New pond sheet with q already in the name', async () => {
    renderShell()
    await openAndType('make')
    fireEvent.click(await rowNamed(/new pond “make”/))
    const sheet = await screen.findByRole('dialog', { name: 'New pond' })
    expect(within(sheet).getByRole('textbox')).toHaveValue('make')
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()
    )
  })
})

describe('⌘K while the New pond sheet is open', () => {
  it('closes it and does not raise the list behind it', async () => {
    renderShell()
    await openAndType('make')
    fireEvent.click(await rowNamed(/new pond “make”/))
    await screen.findByRole('dialog', { name: 'New pond' })

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New pond' })).toBeNull())
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()
    )
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('combobox', { name: 'command palette' })).toBeInTheDocument()
  })
})

it('records never enter the page tree’s cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  await openAndType('cab')
  await rowNamed(/cab inet quote/)
  await waitFor(() =>
    expect(
      client.getQueryCache().find({ queryKey: ['palette-records', 'p-life', 'cab'] })?.state.data
    ).toEqual([QUOTE])
  )
  for (const q of client.getQueryCache().findAll({ queryKey: ['pages'] })) {
    expect(JSON.stringify(q.state.data)).not.toContain('cabinet quote')
  }
})
