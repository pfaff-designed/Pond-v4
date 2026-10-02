/**
 * #260 — `props` framed. ADR 0007: `PropertyInspector` (#17) IS the board's
 * `properties` kind, rendering a page's `_schema` as field-rows and holding no copy,
 * so the work is to FRAME it: DocumentPanel mounts it inside `PondBlock
 * kind="properties"` (400) with the kind as the eyebrow and the field count as the
 * note, `empty` when the schema has no fields. The old hairline wrapper
 * (`border-b border-mn-hair`) is gone — no board draws it.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pageEyebrowClass } from '@/components/atoms/kicker'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))
const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

function renderWith(props: Record<string, unknown>) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Recipe', blocks: [], props })
  mockFetchPages.mockResolvedValue([])
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

describe('DocumentPanel — the inspector sits in the properties card', () => {
  it('a page with a schema: the 400 card, `properties` eyebrow, field-count note, field-rows inside', async () => {
    renderWith({
      _schema: [
        { id: 'kcal', name: 'kcal per serving', type: 'number' },
        { id: 'source', name: 'source', type: 'text' },
      ],
      kcal: 520,
    })
    const input = await screen.findByLabelText('kcal per serving value')
    const card = input.closest<HTMLElement>('[data-block-kind]')!
    expect(card.dataset.blockKind).toBe('properties')
    expect(card.dataset.blockState).toBe('rest')
    expect(card.className.split(' ')).toContain('w-[400px]')
    const eyebrow = screen.getByText('properties')
    expect(eyebrow.className).toBe(pageEyebrowClass)
    expect(card.contains(eyebrow)).toBe(true)
    expect(card.textContent).toContain('2 fields')
    expect(card.querySelectorAll('[data-kind="field-row"]')).toHaveLength(2)
    expect(card.contains(screen.getByLabelText('source value'))).toBe(true)
    // The hairline wrapper is gone: the card is the separation.
    expect(card.parentElement!.className.split(' ')).not.toContain('border-mn-hair')
  })

  it('a schema with no fields: the frame’s empty state — `no fields yet`, no dead action', async () => {
    renderWith({ _schema: [] })
    const line = await screen.findByText('no fields yet')
    const card = line.closest<HTMLElement>('[data-block-kind]')!
    expect(card.dataset.blockKind).toBe('properties')
    expect(card.dataset.blockState).toBe('empty')
    expect(card.textContent).toContain('0 fields')
    expect(card.querySelector('button')).toBeNull()
    expect(screen.queryByText(/no properties/i)).toBeNull()
  })

  it('a page with no schema has no properties card at all', async () => {
    renderWith({})
    await screen.findByLabelText('Page title')
    expect(document.querySelector('[data-block-kind="properties"]')).toBeNull()
  })
})
