/**
 * KAN-103's path test: a premade template, applied through the real `/` menu on
 * the real page surface (`DocumentPanel`), lands with EMPTY blocks that carry
 * their own placeholder — never written to `content` — and the placeholder
 * disappears the moment a person types, returning the moment they delete back
 * to empty. Walked end to end for `notes` (a text block); `project`'s `updates`
 * entry and `meeting notes`' `actions` item are proven by direct render, as the
 * item allows, since the menu path is the one already walked for `notes`.
 *
 * The menu's own keys and clicks, and the todo/entries fields' typing, are real
 * `userEvent`. The text block's own edits go through `writeInTextBlock` — the
 * house helper `block-canvas-slash-path.test.tsx` already documents: tiptap
 * under jsdom is not driven by real keystrokes.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
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
const mockCreatePage = jest.fn()
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
const mockSaveProps = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: (...args: unknown[]) => mockSaveProps(...args),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))
const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
}))

function renderPanel(page: Record<string, unknown>) {
  mockGetPage.mockResolvedValue(page)
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
  mockCreatePage.mockResolvedValue({ id: 'made-1', type: 'page', title: 'notes' })
  mockSaveBlocks.mockResolvedValue(undefined)
  mockSaveProps.mockResolvedValue(undefined)
})

describe('applying `notes` through the real `/` menu leaves a placeholder, never content', () => {
  it('the page’s own text block is empty with the placeholder; typing replaces it, deleting restores it', async () => {
    const user = userEvent.setup()
    renderPanel({ id: 'page-1', parentId: 'root-1', type: 'page', title: 'Health', blocks: [] })

    // PATH_STEPS 1–2: an empty page's `/` leads with templates.
    await user.click(await screen.findByRole('button', { name: 'Add a block' }))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    const notesRow = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'notes')!

    // PATH_STEPS 3: pick `notes` — a blank page's pick applies in place (KAN-124):
    // this page's own blocks become the instantiated stack, never a nested page.
    await user.click(notesRow)
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalled())
    expect(mockCreatePage).not.toHaveBeenCalled()
    const madeBlocks = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(madeBlocks).toHaveLength(1)
    const textBlock = madeBlocks[0]
    // The persisted block never carries the placeholder copy in `content`.
    expect(textBlock).toMatchObject({
      type: 'text',
      content: '',
      placeholder: 'anything, in any order',
    })

    // PATH_STEPS 4: the applied blocks render in place, on this same page.
    const field = await findTextBlock()
    const line = () => field.querySelector('p')!
    expect(line()).toHaveAttribute('data-placeholder', 'anything, in any order')
    expect(line()).toHaveClass('is-editor-empty')

    // PATH_STEPS 5: one character replaces the placeholder; the character is the content.
    const savedFor = (id: string) =>
      mockCommitBlocks.mock.calls.filter((c) => c[2] === id).map((c) => c[3] as Block[])
    writeInTextBlock(field, 'x')
    expect(line()).not.toHaveClass('is-editor-empty')
    expect(field.textContent).toBe('x')
    // The apply's own flush (KAN-124) already logged one save of the stale `/`
    // content before this point — count from here, not from zero, so the wait
    // below can't resolve on that earlier call.
    const savesBeforeTyping = savedFor('page-1').length
    await waitFor(
      () => expect(savedFor('page-1').length).toBeGreaterThan(savesBeforeTyping),
      { timeout: 2000 }
    )
    expect(savedFor('page-1').at(-1)![0]).toMatchObject({
      content: 'x',
      placeholder: 'anything, in any order',
    })

    // Deleting it restores the placeholder, and the save that follows persists
    // an empty block, still carrying its placeholder.
    const savesBeforeDeleting = savedFor('page-1').length
    writeInTextBlock(field, '')
    expect(line()).toHaveClass('is-editor-empty')
    expect(line()).toHaveAttribute('data-placeholder', 'anything, in any order')
    await waitFor(
      () => expect(savedFor('page-1').length).toBeGreaterThan(savesBeforeDeleting),
      { timeout: 2000 }
    )
    expect(savedFor('page-1').at(-1)![0]).toMatchObject({ content: '' })
    expect(savedFor('page-1').at(-1)![0]).toMatchObject({
      content: '',
      placeholder: 'anything, in any order',
    })
  })
})

describe('`project` and `meeting notes` land the same way, by direct render', () => {
  it('`project`’s `updates` entry is empty and shows `first update`', async () => {
    const { blocks } = instantiateTemplate(PREMADE_TEMPLATES.project)
    const updates = blocks.find((b) => b.type === 'entries')!
    renderPanel({
      id: 'made-2',
      parentId: 'root-1',
      type: 'page',
      title: 'project name',
      blocks: [updates],
    })

    const textarea = await screen.findByRole('textbox', { name: 'Entry text' })
    expect(textarea).toHaveValue('')
    expect(textarea).toHaveAttribute('placeholder', 'first update')
  })

  it('`meeting notes`’ `actions` item is empty and shows `first action`', async () => {
    const { blocks } = instantiateTemplate(PREMADE_TEMPLATES['meeting notes'])
    renderPanel({ id: 'made-3', parentId: 'root-1', type: 'page', title: 'meeting', blocks })

    const step = await screen.findByRole('textbox', { name: 'Step' })
    expect(step).toHaveValue('')
    expect(step).toHaveAttribute('placeholder', 'first action')
  })
})
