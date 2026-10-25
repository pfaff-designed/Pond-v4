/**
 * KAN-535's own path: the hint draws on at most one line at a time — the
 * focused empty one. Same `DocumentPanel` host as `kan-345-path.test.tsx`
 * (the bug only reproduces with two editors mounted at once; a lone
 * `BlockCanvas`/`TextView` story never showed it).
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { textEditorOf } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn().mockResolvedValue([])
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

const emptyLineA: Block = { id: 'b-empty-a', type: 'text', content: '' }
const emptyLineB: Block = { id: 'b-empty-b', type: 'text', content: '' }
const textLine: Block = { id: 'b-text', type: 'text', content: 'a' }

function renderPage(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: 'page-1', parentId: null, title: '', blocks, props: {} })
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
  mockFetchPages.mockResolvedValue([])
})

describe('KAN-535 — the trailing-gap hover ghost is gated on focus, not just hover', () => {
  it('hovering the gap while one line is focused draws no ghost on the other; blurring restores it', async () => {
    renderPage([emptyLineA, emptyLineB])
    const user = userEvent.setup()

    const fields = await waitFor(() => {
      const found = screen.queryAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })

    act(() => {
      textEditorOf(fields[0]).commands.focus('start')
    })
    await waitFor(() => expect(fields[0]).toHaveFocus())

    const gap = screen.getByTestId('trailing-block-gap')
    await user.hover(gap)

    expect(fields[1].closest('[data-hover-ghost]')).toBeNull()
    expect(gap.querySelector('span')).toBeNull()

    await user.unhover(gap)
    act(() => {
      fields[0].blur()
    })
    await waitFor(() => expect(fields[0]).not.toHaveFocus())

    await user.hover(gap)
    await waitFor(() => expect(fields[1].closest('[data-hover-ghost]')).not.toBeNull())
  })

  it('hovering the gap below a non-empty last block draws no ghost while another line is focused; blurring restores it', async () => {
    renderPage([emptyLineA, textLine])
    const user = userEvent.setup()

    const fields = await waitFor(() => {
      const found = screen.queryAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })

    act(() => {
      textEditorOf(fields[0]).commands.focus('start')
    })
    await waitFor(() => expect(fields[0]).toHaveFocus())

    const gap = screen.getByTestId('trailing-block-gap')
    await user.hover(gap)
    expect(gap.querySelector('span')).toBeNull()

    await user.unhover(gap)
    act(() => {
      fields[0].blur()
    })
    await waitFor(() => expect(fields[0]).not.toHaveFocus())

    await user.hover(gap)
    await waitFor(() => expect(gap.querySelector('span')).not.toBeNull())
  })

  it('moving focus between two empty lines moves the hint without ever drawing it twice', async () => {
    renderPage([emptyLineA, emptyLineB])

    const fields = await waitFor(() => {
      const found = screen.queryAllByRole('textbox', { name: 'text block' })
      expect(found).toHaveLength(2)
      return found
    })

    act(() => {
      textEditorOf(fields[0]).commands.focus('start')
    })
    await waitFor(() => expect(fields[0]).toHaveClass('ProseMirror-focused'))
    expect(fields[1]).not.toHaveClass('ProseMirror-focused')
    expect(document.querySelector('[data-hover-ghost]')).toBeNull()

    act(() => {
      textEditorOf(fields[1]).commands.focus('start')
    })
    await waitFor(() => expect(fields[1]).toHaveClass('ProseMirror-focused'))
    expect(fields[0]).not.toHaveClass('ProseMirror-focused')
    expect(document.querySelector('[data-hover-ghost]')).toBeNull()
  })
})
