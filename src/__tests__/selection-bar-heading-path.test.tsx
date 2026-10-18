/**
 * KAN-285: picking h1/h2/h4 from the selection bar's text-style menu on a real
 * page block makes it that heading in the DOM and in the saved markdown, and
 * the bar stays. Same harness as `selection-bar-path.test.tsx` (real
 * `DocumentPanel` + a live Tiptap text block + the page's own debounced save,
 * `SelectionBar` mounted beside it, `commitBlocks` mocked), but choosing a
 * heading row instead of clicking bold.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { clearSelection, selectAll, selectWord } from './helpers/selection'
import { findTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
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
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const SENTENCE = 'Notes on the workbench build'
const WORD = 'workbench'

const renderPage = (content: string = SENTENCE) => {
  const blocks: Block[] = [{ id: 'b-text', type: 'text', content }]
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <SelectionBar onAsk={jest.fn()} disabled={false} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

/** Selects `WORD`, opens the text-style menu, and picks `style` (e.g. `h2`). */
async function pickHeadingFromBar(user: ReturnType<typeof userEvent.setup>, style: string) {
  const field = await findTextBlock()
  selectWord(within(field).getByText(SENTENCE), WORD)

  const toolbar = await screen.findByRole('toolbar', { name: 'selection' })
  await user.click(within(toolbar).getByRole('button', { name: 'text' }))

  const menu = await screen.findByRole('menu', { name: 'text style' })
  await user.click(within(menu).getByRole('menuitem', { name: style }))

  return { field, toolbar }
}

describe.each([
  { style: 'h2', level: 2, markdown: `## ${SENTENCE}` },
  { style: 'h1', level: 1, markdown: `# ${SENTENCE}` },
  { style: 'h4', level: 4, markdown: `#### ${SENTENCE}` },
])('choosing $style from the selection bar on a real page block', ({ style, level, markdown }) => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
  })
  afterEach(() => clearSelection())

  it(`keeps the block an <h${level}> and saves "${markdown}"`, async () => {
    const user = userEvent.setup()
    renderPage()

    const { field, toolbar } = await pickHeadingFromBar(user, style)

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })

    // (a) the block's DOM inside the page is the right heading, not a <p> —
    // checked once right after the style change and again after the save
    // resolves and the page re-renders, so a later revert is caught too.
    expect(field.querySelector(`h${level}`)).not.toBeNull()
    expect(field.querySelector('p')).toBeNull()

    await waitFor(() => {
      expect(field.querySelector(`h${level}`)).not.toBeNull()
      expect(field.querySelector('p')).toBeNull()
    })

    // (b) the last save wrote the heading's markdown, not the plain sentence.
    const [, , , savedBlocks] = mockCommitBlocks.mock.calls[mockCommitBlocks.mock.calls.length - 1]
    expect((savedBlocks as Block[]).find((b) => b.id === 'b-text')).toEqual({
      id: 'b-text',
      type: 'text',
      content: markdown,
    })

    // (c) the toolbar is still mounted.
    expect(toolbar.isConnected).toBe(true)
  })
})

describe('choosing a style after ⌘A select-all over multiple lines', () => {
  const LINES = ['First line', 'Second line', 'Third line']
  const CONTENT = LINES.join('\n\n')

  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
  })
  afterEach(() => clearSelection())

  it('converts every line to h2 and keeps the selection and the bar up', async () => {
    const user = userEvent.setup()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    renderPage(CONTENT)

    const field = await findTextBlock()
    // A real select-all's Range has both endpoints on the editable root
    // itself, not on a text node inside it — unlike `selectWord`'s range.
    selectAll(field)

    const toolbar = await screen.findByRole('toolbar', { name: 'selection' })
    await user.click(within(toolbar).getByRole('button', { name: 'text' }))
    const menu = await screen.findByRole('menu', { name: 'text style' })
    await user.click(within(menu).getByRole('menuitem', { name: 'h2' }))

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })

    await waitFor(() => {
      expect(field.querySelectorAll('h2')).toHaveLength(LINES.length)
      expect(field.querySelector('p')).toBeNull()
    })

    const [, , , savedBlocks] = mockCommitBlocks.mock.calls[mockCommitBlocks.mock.calls.length - 1]
    expect((savedBlocks as Block[]).find((b) => b.id === 'b-text')).toEqual({
      id: 'b-text',
      type: 'text',
      content: LINES.map((line) => `## ${line}`).join('\n\n'),
    })

    expect(toolbar.isConnected).toBe(true)
    expect(window.getSelection()?.isCollapsed).toBe(false)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('TextSelection endpoint'))

    warnSpy.mockRestore()
  })
})
