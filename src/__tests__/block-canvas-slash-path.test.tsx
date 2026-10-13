/**
 * The whole `/` path (KAN-276), walked on the real `BlockCanvas` rather than
 * asserted piecewise: a blank page leads with templates and can still reach
 * every block by keyboard and by pointer, a narrowed query and a backspace both
 * round-trip the list, and the templates pane reached from `page from template`
 * always has a way out. Every clause of the ticket's acceptance list is an
 * assertion below.
 *
 * `BlockCanvas` is controlled, so this needs a stateful host — unlike the other
 * `BlockCanvas` suites' `onChange: () => {}`, a query narrowed by what was typed
 * only shows up once the edit round-trips back in as a new `blocks` prop, the
 * way `DocumentPanel` really drives it.
 *
 * Typing is `writeInTextBlock` (the house helper: tiptap under jsdom isn't
 * driven by real keystrokes — every other slash-menu suite uses it too); the
 * menu's own keys and clicks are real `userEvent`, since `SlashMenu` listens on
 * `document` and reacts to them exactly as a person's keypresses would.
 */

import React, { useState } from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { BLANK_TEXT_GROUP } from '@/components/molecules/slash-entries'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

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
]

function Harness({ initialBlocks }: { initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState(initialBlocks)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
      onChange={setBlocks}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initialBlocks={blocks} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const groupsOf = (menu: HTMLElement) =>
  [...menu.parentElement!.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
const labelsOf = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('option')
    .map((o) => o.querySelector('[data-part="label"]')!.textContent)

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue(pageRows)
})

describe('the whole `/` path on a blank page (KAN-276)', () => {
  it('leads with templates, reaches `text` by ↓ and ↵, narrows by query, and restores on backspace', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    // 1–2: one empty block, `/` opens leading with templates, no head.
    writeInTextBlock(await findTextBlock(), '/')
    let menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.parentElement!.querySelector('[data-part="head"]')).not.toBeInTheDocument()
    expect(groupsOf(menu)).toEqual(['templates', BLANK_TEXT_GROUP, 'blocks', 'templates', 'pages'])

    // 3: ↓ past the twelve premade templates reaches `text`; ↵ inserts it and closes the menu.
    for (let i = 0; i < 12; i++) await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { selected: true }).querySelector('[data-part="label"]')!
      .textContent).toBe('text')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    // 4: the freshly-inserted block is itself blank — `/ta` narrows to matches,
    // backspacing to `/` restores the full, templates-led list.
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/ta')
    menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.querySelectorAll('[role="presentation"]')).toHaveLength(0)
    expect(labelsOf(menu)).toEqual(expect.arrayContaining(['table', 'database']))

    writeInTextBlock(editor, '/')
    menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(groupsOf(menu)).toEqual(['templates', BLANK_TEXT_GROUP, 'blocks', 'templates', 'pages'])

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})

describe('the templates pane always has a way out, on a page with content (KAN-276)', () => {
  it('← , a typed letter, and the `← blocks` click all return to the rows; esc closes', async () => {
    const user = userEvent.setup()
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([note, emptyLine])

    // 5: existing content keeps the ordinary (non-leading) rows.
    const host = () => within(document.getElementById('block-b-empty')!).getByRole('textbox', {
      name: 'text block',
    })
    writeInTextBlock(host(), '/')
    let menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(menu.parentElement!.querySelector('[data-part="head"]')).not.toBeInTheDocument()
    expect(groupsOf(menu)).toEqual(['text', 'blocks', 'templates', 'pages'])

    const openTemplatesPane = async () => {
      const row = within(await screen.findByRole('listbox', { name: 'blocks' }))
        .getAllByRole('option')
        .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'page from template')!
      await user.click(row)
      const glass = document.querySelector('[data-pane]')!
      expect(glass).toHaveAttribute('data-pane', 'templates')
    }

    // `page from template` → the templates pane → ← returns to the rows.
    await openTemplatesPane()
    await user.keyboard('{ArrowLeft}')
    menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(document.querySelector('[data-pane]')).toHaveAttribute('data-pane', 'rows')

    // Re-enter, then a typed letter returns to the rows, narrowed by it.
    await openTemplatesPane()
    writeInTextBlock(host(), '/x')
    await waitFor(() =>
      expect(document.querySelector('[data-pane]')).toHaveAttribute('data-pane', 'rows')
    )
    menu = await screen.findByRole('listbox', { name: 'blocks' })
    for (const label of labelsOf(menu)) expect(label.toLowerCase().includes('x')).toBe(true)

    // Back to the full rows, re-enter once more, and leave by the pointer affordance this time.
    writeInTextBlock(host(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    await openTemplatesPane()
    await user.click(screen.getByText('← blocks'))
    await waitFor(() =>
      expect(document.querySelector('[data-pane]')).toHaveAttribute('data-pane', 'rows')
    )

    // Esc closes from there, as from any other state.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('a pointer click into `page from template` never steals focus from the editor', async () => {
    const user = userEvent.setup()
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([note, emptyLine])

    const host = () =>
      within(document.getElementById('block-b-empty')!).getByRole('textbox', { name: 'text block' })
    host().focus()
    writeInTextBlock(host(), '/')
    const row = within(await screen.findByRole('listbox', { name: 'blocks' }))
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'page from template')!

    let mousedown: Event | undefined
    const capture = (e: Event) => {
      mousedown = e
    }
    row.addEventListener('mousedown', capture)
    await user.click(row)
    row.removeEventListener('mousedown', capture)

    expect(mousedown?.defaultPrevented).toBe(true)
    expect(document.querySelector('[data-part="glass"]')).toHaveAttribute('data-pane', 'templates')
    // The caret never left the editor, so this is `host()`, never the glass or `<body>`.
    expect(document.activeElement).toBe(host())

    // A typed letter narrows the rows — it reached the field, not the glass.
    writeInTextBlock(host(), '/x')
    await waitFor(() =>
      expect(document.querySelector('[data-pane]')).toHaveAttribute('data-pane', 'rows')
    )
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    for (const label of labelsOf(menu)) expect(label.toLowerCase().includes('x')).toBe(true)
  })
})
