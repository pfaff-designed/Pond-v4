/**
 * `/link to page` opens the pages picker rather than minting a block
 * (KAN-463, PATH_STEPS 3+7): picking the row lists the pond's other pages
 * (this page excluded), and Escape closes it with nothing landed.
 */

import React, { useState } from 'react'
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import {
  findAllTextBlocks,
  findTextBlock,
  queryAllTextBlocks,
  writeInTextBlock,
} from './helpers/text-block'

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
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))
const mockCreatePage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
}))
const mockStampNestedPage = jest.fn()
jest.mock('@/lib/pages/nested-page', () => ({
  ...jest.requireActual('@/lib/pages/nested-page'),
  stampNestedPage: (...args: unknown[]) => mockStampNestedPage(...args),
}))

const pageRows = [
  { id: 'root-1', parent_id: null, type: 'page', title: 'recipes', order: 0, updated_at: '' },
  {
    id: 'page-1',
    parent_id: 'root-1',
    type: 'page',
    title: 'sourdough, 78%',
    order: 0,
    updated_at: '',
  },
  { id: 'page-2', parent_id: 'root-1', type: 'page', title: 'roof', order: 1, updated_at: '' },
]

function Harness({
  initialBlocks,
  onChange,
}: {
  initialBlocks: Block[]
  onChange: jest.Mock
}) {
  const [blocks, setBlocks] = useState(initialBlocks)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
      onChange={(next) => {
        onChange(next)
        setBlocks(next)
      }}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initialBlocks={blocks} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue(pageRows)
})

describe('`/link to page` opens the pages picker (KAN-463)', () => {
  it('lists the pond’s other pages, excluding this one; Escape closes with nothing landed', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/link')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!

    await user.click(row)
    await waitFor(() =>
      expect(screen.queryByRole('listbox', { name: 'blocks' })).not.toBeInTheDocument()
    )

    const pagesListbox = await screen.findByRole('listbox', { name: 'pages' })
    const labels = within(pagesListbox)
      .getAllByRole('option')
      .map((o) => o.querySelector('[data-part="pre"]')?.textContent)
    expect(labels).toEqual(expect.arrayContaining(['roof', 'recipes']))
    expect(labels).not.toContain('sourdough, 78%')

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('listbox', { name: 'pages' })).not.toBeInTheDocument()
    )
    // No block landed where the `/` was — the host line is still the one empty block.
    expect(await findAllTextBlocks()).toHaveLength(1)
  })

  it('typing while the picker is open narrows its rows by title', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/link')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!
    await user.click(row)

    const pagesListbox = await screen.findByRole('listbox', { name: 'pages' })
    const labelsOf = (listbox: HTMLElement) =>
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.querySelector('[data-part="pre"]')?.textContent)
    expect(labelsOf(pagesListbox)).toEqual(expect.arrayContaining(['roof', 'recipes']))

    await user.keyboard('roof')
    await waitFor(() => expect(labelsOf(pagesListbox)).toEqual(['roof']))
  })

  it('typing a filter after ArrowDown resets the active row, so Enter picks the first remaining row', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { onChange } = renderCanvas([emptyLine])

    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/link')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!
    await user.click(row)

    const pagesListbox = await screen.findByRole('listbox', { name: 'pages' })
    const labelsOf = (listbox: HTMLElement) =>
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.querySelector('[data-part="pre"]')?.textContent)
    // Unfiltered: ['recipes', 'roof'] — `pages`' own order, `sourdough` excluded.
    expect(labelsOf(pagesListbox)).toEqual(['recipes', 'roof'])

    // Move the active row to index 1 ('roof'), then narrow to a query that
    // only 'recipes' matches — the list shortens to one row at index 0.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('rec')
    await waitFor(() => expect(labelsOf(pagesListbox)).toEqual(['recipes']))

    await user.keyboard('{Enter}')
    await waitFor(() => {
      const blocks = lastBlocks(onChange)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ type: 'page-link', pageId: 'root-1' })
    })
  })

  it('picking a page inserts a page-link block at the `/` line’s index, pointed at that page’s id — nothing else moves', async () => {
    const user = userEvent.setup()
    const before: Block = { id: 'b-before', type: 'text', content: 'before' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { onChange } = renderCanvas([before, emptyLine])

    const editors = await findAllTextBlocks()
    writeInTextBlock(editors[1], '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editors[1], '/link')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!
    await user.click(row)

    const pagesListbox = await screen.findByRole('listbox', { name: 'pages' })
    const option = within(pagesListbox)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="pre"]')?.textContent === 'roof')!
    await user.click(option)

    await waitFor(() => {
      const blocks = lastBlocks(onChange)
      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toEqual(before)
      expect(blocks[1]).toMatchObject({ type: 'page-link', pageId: 'page-2' })
    })
    expect(mockCreatePage).not.toHaveBeenCalled()
    expect(mockStampNestedPage).not.toHaveBeenCalled()
  })

  it('a double ↵ on the same row before the glass unmounts lands one page-link, not two (AUDIT G9)', async () => {
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { onChange } = renderCanvas([emptyLine])

    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/link')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!
    fireEvent.click(row)

    await screen.findByRole('listbox', { name: 'pages' })
    const callsBeforePick = onChange.mock.calls.length

    // Both `Enter`s dispatched inside one `act`, so the second reaches
    // `PagesPicker`'s capture listener before the first pick's `setPagesPicker(null)`
    // has unmounted it — the real double-submit race, not two picks on a row
    // React has already removed. `blocksRef.current` stays stale across both
    // synchronous calls, so a landed/landed race wouldn't show up in the
    // final block count — only the extra `onChange` call reveals the second,
    // unguarded, pick.
    act(() => {
      fireEvent.keyDown(document, { key: 'Enter' })
      fireEvent.keyDown(document, { key: 'Enter' })
    })

    await waitFor(() => {
      const blocks = lastBlocks(onChange)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ type: 'page-link' })
    })
    expect(onChange.mock.calls.length - callsBeforePick).toBe(1)
    expect(mockCreatePage).not.toHaveBeenCalled()
  })

  it('blurs the still-focused editor so a typed filter cannot drift its content, and gives focus back on Escape', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    const { onChange } = renderCanvas([emptyLine])

    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/link')
    // The `/` row's own `onMouseDown` preventDefault (SlashMenu.tsx) keeps the
    // editor focused through a pick on purpose — real typing in the browser
    // does too, which `writeInTextBlock`'s programmatic `setContent` doesn't
    // reproduce on its own.
    act(() => editor.focus())
    expect(document.activeElement).toBe(editor)
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!
    await user.click(row)
    await screen.findByRole('listbox', { name: 'pages' })

    // The verifier's bug: a filter letter reached the still-focused editor as
    // native input, drifting its content away from the snapshotted `/link`
    // target so `landAtSlash` kept the drifted host and appended the
    // page-link beside it instead of replacing the `/` line.
    expect(document.activeElement).not.toBe(editor)

    await user.keyboard('roof')
    // Typed letters still narrow the picker — they land in `pagesPickerQuery`,
    // never in the (now unfocused) editor.
    const pagesListbox = screen.getByRole('listbox', { name: 'pages' })
    expect(
      within(pagesListbox)
        .getAllByRole('option')
        .map((o) => o.querySelector('[data-part="pre"]')?.textContent)
    ).toEqual(['roof'])

    await user.keyboard('{Enter}')
    await waitFor(() => {
      const blocks = lastBlocks(onChange)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ type: 'page-link' })
    })
    // No leftover '/link…' text block beside the landed page-link.
    expect(queryAllTextBlocks()).toHaveLength(0)
  })

  it('Escape after the blur gives focus back to the host editor, so typing can resume', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/link')
    act(() => editor.focus())
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const row = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'link to page')!
    await user.click(row)
    await screen.findByRole('listbox', { name: 'pages' })
    expect(document.activeElement).not.toBe(editor)

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('listbox', { name: 'pages' })).not.toBeInTheDocument()
    )
    expect(document.activeElement).toBe(editor)
  })
})
