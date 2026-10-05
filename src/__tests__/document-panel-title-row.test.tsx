/**
 * KAN-59 — the title row (`Pond 06.21` 6u.1): the page's name at left, one eyebrow at
 * right reading `{kind} — {state}`. The save state lives in that eyebrow and nowhere
 * else, so the old mono `saved` span and the `changes` button are gone.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))
const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))

function renderWith(props: Record<string, unknown>) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Kitchen renovation', blocks: [], props })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('DocumentPanel — the title row', () => {
  it('sets the title and the eyebrow on one baseline row, padded 4px, title left', async () => {
    renderWith({ kind: 'project' })
    const title = await screen.findByLabelText('Page title')
    const row = title.parentElement!
    expect(row.className).toContain('flex')
    expect(row.className).toContain('items-end')
    expect(row.className).toContain('justify-between')
    expect(row.className).toContain('px-[4px]')
    expect(row.lastElementChild).toBe(screen.getByText('project — saved'))
  })

  it('the title is 38px / 700 / -.01em / uppercase', async () => {
    renderWith({})
    const cls = (await screen.findByLabelText('Page title')).className
    for (const token of ['text-[38px]', 'font-bold', 'tracking-[-0.01em]', 'uppercase']) {
      expect(cls).toContain(token)
    }
  })

  it('the eyebrow is 500 / 10.5px / .1em / uppercase at ink .68', async () => {
    renderWith({ kind: 'project' })
    const cls = (await screen.findByText('project — saved')).className
    for (const token of [
      'font-medium',
      'text-[10.5px]',
      'tracking-[.1em]',
      'uppercase',
      'text-mn-text-secondary',
    ]) {
      expect(cls).toContain(token)
    }
    expect(cls).not.toContain('font-mono')
  })

  it('reads the page’s kind, and shows only the state when no kind is set', async () => {
    renderWith({})
    expect(await screen.findByText('saved')).toBeInTheDocument()
    expect(screen.queryByText(/—/)).toBeNull()
  })

  it('treats a blank kind as no kind', async () => {
    renderWith({ kind: '   ' })
    expect(await screen.findByText('saved')).toBeInTheDocument()
  })

  it('draws no separate `saved` span and no `changes` button', async () => {
    renderWith({ kind: 'project' })
    await screen.findByLabelText('Page title')
    expect(screen.getAllByText(/saved/)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'changes' })).toBeNull()
  })
})
