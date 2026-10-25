/**
 * The whole `/` path (KAN-276), walked on the real `BlockCanvas` rather than
 * asserted piecewise: a blank page leads with templates and can still reach
 * every block by keyboard and by pointer, a narrowed query and a backspace both
 * round-trip the list, and the templates pane reached from `page from template`
 * always has a way out. Every clause of the ticket's acceptance list is an
 * assertion below.
 *
 * The same surface also carries the free-text path for an unmatched word
 * (KAN-114): `/wine` offers `text` and `heading` rows rather than the old
 * empty note, lands either kind, and esc leaves the typed `/wine` alone.
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
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { BLANK_TEXT_GROUP } from '@/components/molecules/slash-entries'
import {
  findAllTextBlocks,
  findTextBlock,
  textEditorOf,
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
    <BlockCanvas blocks={blocks} pageId="page-1" pageTitle="sourdough, 78%" onChange={setBlocks} />
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

    // 3: ↓ past the premade templates (page stays in the templates pane) reaches `text`.
    for (let i = 0; i < 11; i++) await user.keyboard('{ArrowDown}')
    expect(
      screen.getByRole('option', { selected: true }).querySelector('[data-part="label"]')!
        .textContent
    ).toBe('text')
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
    const host = () =>
      within(document.getElementById('block-b-empty')!).getByRole('textbox', {
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

const footOf = (menu: HTMLElement) => menu.parentElement!.querySelector('[data-part="foot"]')

describe('the free-text path for an unmatched word (KAN-114)', () => {
  it('offers text or heading for `/wine`, lands either, and esc leaves it typed', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    // 2: `/wine` matches nothing registered — two free-text rows, `text`
    // selected (hint hidden per the hint-hidden-on-select rule, ↵ only) and
    // the foot names what ↵ inserts.
    const editorAtStart = await findTextBlock()
    writeInTextBlock(editorAtStart, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editorAtStart, '/wine')
    let menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(labelsOf(menu)).toEqual(['text — “wine”', 'heading — “wine”'])
    expect(
      within(screen.getByRole('option', { selected: true })).queryByText('no block named wine')
    ).not.toBeInTheDocument()
    expect(footOf(menu)!.textContent).toBe('↵ insert as text')

    // 3: ↵ lands a text block reading `wine`; the menu closes.
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    let editor = await findTextBlock()
    expect(within(editor).queryByRole('heading')).not.toBeInTheDocument()
    expect(editor.textContent).toBe('wine')

    // 4: `/wine` again, ↓ selects `heading` and the foot follows; ↵ lands a
    // heading block (markdown `## wine`) reading `wine`. The whole-block `/`
    // path only opens from a block that is truly empty (`use-slash-line.ts`'s
    // `handleTextChange`), so the retyping happens in a fresh block from the
    // trailing gap, as it would on the real page.
    await user.click(screen.getByTestId('trailing-block-gap'))
    editor = (await findAllTextBlocks()).at(-1)!
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/wine')
    menu = await screen.findByRole('listbox', { name: 'blocks' })
    await user.keyboard('{ArrowDown}')
    expect(labelsOf(menu)[1]).toBe('heading — “wine”')
    expect(screen.getByRole('option', { selected: true })).toBe(screen.getAllByRole('option')[1])
    // `text` is no longer selected, so its hint now shows.
    expect(
      within(screen.getAllByRole('option')[0]).getByText('no block named wine')
    ).toBeInTheDocument()
    expect(footOf(menu)!.textContent).toBe('↵ insert as heading')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    // The landed heading takes a freshly-minted block id, so it is a new element
    // (`editor` would be the stale, now-detached one that held `/wine`).
    expect(await screen.findByRole('heading', { level: 2, name: 'wine' })).toBeInTheDocument()

    // 5: `/wine` a third time, esc closes the menu and leaves `/wine` as typed text.
    await user.click(screen.getByTestId('trailing-block-gap'))
    editor = (await findAllTextBlocks()).at(-1)!
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/wine')
    await screen.findByRole('listbox', { name: 'blocks' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(editor.textContent).toBe('/wine')
  })
})

describe('the `/quote` path lands empty and Return returns to prose (KAN-462)', () => {
  it('`/quo` → ↵ opens an empty quote with the caret inside; typing fills it; Return twice leaves it for prose', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editorAtStart = await findTextBlock()
    writeInTextBlock(editorAtStart, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editorAtStart, '/quo')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(labelsOf(menu)).toEqual(['quote'])

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    const quoteField = await findTextBlock()
    await waitFor(() => expect(quoteField).toHaveFocus())
    expect(quoteField.querySelector('blockquote')).toBeInTheDocument()
    expect(quoteField.textContent).toBe('')

    act(() => {
      textEditorOf(quoteField).commands.insertContent('words')
    })
    expect(quoteField.querySelector('blockquote')?.textContent).toBe('words')

    await user.keyboard('{Enter}')
    const freshLine = (await findAllTextBlocks()).at(-1)!
    await waitFor(() => expect(freshLine).toHaveFocus())
    expect(freshLine.querySelector('blockquote')).not.toBeInTheDocument()

    // The fresh line is already an empty, unlabelled block, so a second Return
    // does nothing further (`block-return.test.tsx`'s "one action, one write").
    await user.keyboard('{Enter}')
    const fields = await findAllTextBlocks()
    expect(fields).toHaveLength(2)
    const prose = fields.at(-1)!
    expect(prose).toBe(freshLine)
    await waitFor(() => expect(prose).toHaveFocus())
    expect(prose.querySelector('blockquote')).not.toBeInTheDocument()
    expect(fields[0].querySelector('blockquote')?.textContent).toBe('words')
  })

  it('`/quo` → ↵ on the still-empty quote: Return lifts it back to prose, not a new block', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editorAtStart = await findTextBlock()
    writeInTextBlock(editorAtStart, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editorAtStart, '/quo')
    await screen.findByRole('listbox', { name: 'blocks' })
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    const quoteField = await findTextBlock()
    await waitFor(() => expect(quoteField).toHaveFocus())
    expect(quoteField.querySelector('blockquote')).toBeInTheDocument()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(quoteField.querySelector('blockquote')).not.toBeInTheDocument())
    expect((await findAllTextBlocks())).toHaveLength(1)
    expect(quoteField).toHaveFocus()
    expect(quoteField.textContent).toBe('')
  })
})

describe('the `/divider` and `/numbered` paths land with the caret ready (KAN-462)', () => {
  it('`/div` → ↵ opens a divider with the caret in the empty line after the rule', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editorAtStart = await findTextBlock()
    writeInTextBlock(editorAtStart, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editorAtStart, '/div')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(labelsOf(menu)).toEqual(['divider'])

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    const field = await findTextBlock()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.querySelector('hr')).toBeInTheDocument()

    const { $from } = textEditorOf(field).state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.textContent).toBe('')
  })

  it('`/numbered` → ↵ opens a numbered list with the caret inside the empty item', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editorAtStart = await findTextBlock()
    writeInTextBlock(editorAtStart, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editorAtStart, '/numbered')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(labelsOf(menu)).toEqual(['numbered list'])

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    const field = await findTextBlock()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.querySelector('ol > li')).toBeInTheDocument()
    expect(field.textContent).toBe('')

    const { $from } = textEditorOf(field).state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.textContent).toBe('')
  })
})

describe('`/table of contents` lists the page\'s headings and jumps to them (KAN-482)', () => {
  it('`/table of contents` → ↵ lands a block listing three headings; clicking the third scrolls to it', async () => {
    const user = userEvent.setup()
    const h1: Block = { id: 'h1', type: 'text', content: '# one' }
    const h2: Block = { id: 'h2', type: 'text', content: '## two' }
    const h3: Block = { id: 'h3', type: 'text', content: '### three' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([h1, h2, h3, emptyLine])

    const host = () =>
      within(document.getElementById('block-b-empty')!).getByRole('textbox', {
        name: 'text block',
      })
    writeInTextBlock(host(), '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(host(), '/table of contents')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(labelsOf(menu)).toEqual(['table of contents'])

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    const rows = screen.getAllByRole('button', { name: /^(one|two|three)$/ })
    expect(rows.map((row) => row.textContent)).toEqual(['one', 'two', 'three'])

    const headingThree = document.getElementById('block-h3')!
    const scrollIntoView = jest.fn()
    headingThree.scrollIntoView = scrollIntoView
    await user.click(rows[2])
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('focusing an entry then leaving the block keeps the table of contents (KAN-482)', async () => {
    const user = userEvent.setup()
    const h1: Block = { id: 'h1', type: 'text', content: '# one' }
    const toc: Block = { id: 'b-toc', type: 'toc' }
    renderCanvas([h1, toc])

    const row = screen.getByRole('button', { name: 'one' })
    await user.click(row)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    await user.click(outside)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(document.getElementById('block-b-toc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'one' })).toBeInTheDocument()
    outside.remove()
  })
})

// The row also hosts `BlockHandleMenu`'s own popup-trigger button, which also
// carries `aria-expanded` — told apart by `aria-haspopup`, which only it has
// (`toggle-fold-persist.test.tsx`'s own helper).
const foldButtonIn = (row: HTMLElement) =>
  within(row)
    .getAllByRole('button')
    .find((b) => !b.hasAttribute('aria-haspopup'))!

describe('the `/toggle` path lands a fold with the caret in its summary (KAN-480)', () => {
  it('/toggle ↵ → type the summary → ↵ → type the body → ▸ folds and unfolds it', async () => {
    const user = userEvent.setup()
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderCanvas([emptyLine])

    const editorAtStart = await findTextBlock()
    writeInTextBlock(editorAtStart, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editorAtStart, '/toggle')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    expect(labelsOf(menu)).toEqual(['toggle'])

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    // The toggle lands unfolded, so both its summary and body fields are
    // already mounted — the summary (the first one) takes the caret.
    const [summary] = await findAllTextBlocks()
    await waitFor(() => expect(summary).toHaveFocus())

    writeInTextBlock(summary, 'packing list')
    await user.keyboard('{Enter}')

    const body = (await findAllTextBlocks())[1]
    await waitFor(() => expect(body).toHaveFocus())
    writeInTextBlock(body, 'passport')
    await waitFor(() => expect(body.textContent).toBe('passport'))

    const row = document.querySelector<HTMLElement>('[data-block-id]')!
    const foldButton = foldButtonIn(row)
    expect(foldButton).toHaveAttribute('aria-expanded', 'true')

    await user.click(foldButton)
    expect(foldButton).toHaveAttribute('aria-expanded', 'false')
    expect(within(row).queryByText('passport')).not.toBeInTheDocument()

    await user.click(foldButton)
    expect(foldButton).toHaveAttribute('aria-expanded', 'true')
    expect(within(row).getByText('passport')).toBeInTheDocument()
  })
})
