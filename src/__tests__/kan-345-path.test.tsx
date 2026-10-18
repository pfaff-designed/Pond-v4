/**
 * KAN-345's own PATH_STEPS, walked on the real page-hosting organism
 * (`DocumentPanel`, which mounts `BlockCanvas` with `chrome` on) — not a bare
 * `BlockCanvas` harness, since the title this walk starts below lives one
 * level up. Per-rule unit coverage already lives in
 * `block-canvas-trailing-gap.test.tsx` and `block-canvas-gap-line.test.tsx`;
 * this file only proves the whole path holds end to end on the host a person
 * actually opens. Visual theme parity (computed colour, type) is the live
 * verifier's job, same disclaimer as `document-panel-untouched-path.test.tsx`
 * — jsdom can't compute CSS, so dark here only checks the real `.dark` root
 * class and that the hover-affordance nodes survive the flip.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { PondCommand } from '@/components/organisms/PondCommand'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock, queryAllTextBlocks, writeInTextBlock } from './helpers/text-block'

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

const tableA: Block = {
  id: 'b-table-a',
  type: 'table',
  title: 'Power Tools',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Table Saw', 'Centre of shop'] }],
}
const tableB: Block = {
  id: 'b-table-b',
  type: 'table',
  title: 'Hand Tools',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r2', cells: ['Chisel', 'Bench drawer'] }],
}

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

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

describe('KAN-345 — the no-prompts-at-rest path, on the real page surface', () => {
  it('a blank page: no prompts at rest, the trailing gap opens a line, typing fills it, and the gap below keeps minting (or reusing) exactly one more', async () => {
    renderPage([])
    const user = userEvent.setup()

    await screen.findByLabelText('Page title')
    expect(screen.queryByText(/write something/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a block' })).not.toBeInTheDocument()

    const gap = screen.getByTestId('trailing-block-gap')
    await user.hover(gap)
    const ghost = gap.querySelector('span')!
    expect(ghost.textContent).toBe('type, or / for blocks')
    expect(ghost.className).toContain('opacity-0')
    expect(ghost.className).toContain('group-hover/trailing-gap:opacity-100')

    await user.click(gap)
    const field = await waitFor(() => {
      const found = queryAllTextBlocks()
      expect(found).toHaveLength(1)
      return found[0]
    })
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.querySelector('p')).toHaveClass('is-editor-empty')
    expect(field.querySelector('p')).toHaveAttribute('data-placeholder', 'type, or / for blocks')

    writeInTextBlock(field, 'hello')
    expect(field.querySelector('p')).not.toHaveClass('is-editor-empty')
    expect(field).toHaveTextContent('hello')

    // Below the last ("hello") block, the same gap opens a fresh line.
    await user.click(gap)
    const fields = await waitFor(() => {
      const found = queryAllTextBlocks()
      expect(found).toHaveLength(2)
      return found
    })
    await waitFor(() => expect(fields[1]).toHaveFocus())

    // Clicking it again while that line is still empty focuses it, not a third (G9).
    fields[1].blur()
    await user.click(gap)
    await waitFor(() => expect(fields[1]).toHaveFocus())
    expect(queryAllTextBlocks()).toHaveLength(2)
  })

  it('two stacked non-text blocks: the between-row line opens a focused empty line between them', async () => {
    renderPage([tableA, tableB])
    const user = userEvent.setup()

    await screen.findAllByText('Power Tools')
    await screen.findAllByText('Hand Tools')

    const line = screen.getByTestId('block-gap-line')
    await user.hover(line)
    const hairline = line.querySelector('span')!
    expect(hairline.className).toContain('opacity-0')
    expect(hairline.className).toContain('group-hover/block-gap-line:opacity-100')

    await user.click(line)
    const field = await findTextBlock()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.querySelector('p')).toHaveAttribute('data-placeholder', 'type, or / for blocks')

    const fieldBlockId = field.closest('[id^="block-"]')!.id
    const order = [...document.querySelectorAll('[id^="block-"]')].map((el) => el.id)
    expect(order.indexOf('block-b-table-a')).toBeLessThan(order.indexOf(fieldBlockId))
    expect(order.indexOf(fieldBlockId)).toBeLessThan(order.indexOf('block-b-table-b'))
  })

  it('holds the same affordances in dark: the real toggle flips `.dark`, and both gap nodes survive', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGetPage.mockResolvedValue({
      id: 'page-1',
      parentId: null,
      title: '',
      blocks: [tableA, tableB],
      props: {},
    })
    render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <PondCommand
            path={{ glyph: 'ramp', trail: [], current: 'Power Tools', role: null }}
            open={false}
            items={[]}
            onSelect={jest.fn()}
            onOpenChange={jest.fn()}
          />
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    await screen.findAllByText('Power Tools')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'dark mode' }))
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))

    expect(screen.getByTestId('trailing-block-gap')).toBeInTheDocument()
    expect(screen.getByTestId('block-gap-line')).toBeInTheDocument()
  })
})
