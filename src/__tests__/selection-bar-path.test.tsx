/**
 * KAN-95 path test: a person opens a page with a text block, drags across
 * some words, sees the selection bar with its twelve items in order (the
 * board's ten, plus strike and code), and clicks bold — the words are bold
 * in the block's own saved markdown.
 *
 * Renders the real `DocumentPanel` (the page, its live Tiptap block and its
 * debounced save) with `SelectionBar` mounted beside it exactly as `AITerminal`
 * mounts it (`onAsk` + `disabled`). Nothing about the editor or the bar is
 * mocked, so the proof is what `commitBlocks` is asked to save. The words are
 * selected as a real `Range` (`selectWord`), not a `userEvent` drag: ProseMirror's
 * mousedown handler calls `document.elementFromPoint`, which jsdom lacks. The
 * click on B is a real `userEvent` pointer click (pointerdown → mousedown →
 * click), which is what exercises the bar's outside-press dismissal.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { SelectionBar, SELECTION_BAR_ITEMS } from '@/components/molecules/SelectionBar'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { clearSelection, selectWord } from './helpers/selection'
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
const WORDS = 'workbench'

const blocks: Block[] = [{ id: 'b-text', type: 'text', content: SENTENCE }]

const renderPage = () => {
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

const nameOf = (button: HTMLElement) =>
  button.getAttribute('aria-label') ?? button.textContent?.trim()

describe('selecting words on a page shows the bar and bold writes to the block', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
  })
  afterEach(() => clearSelection())

  it('drags over a word, shows twelve items in order, and B saves it as **bold**', async () => {
    const user = userEvent.setup()
    renderPage()
    const field = await findTextBlock()
    expect(screen.queryByRole('toolbar', { name: 'selection' })).toBeNull()

    selectWord(within(field).getByText(SENTENCE), WORDS)

    const toolbar = await screen.findByRole('toolbar', { name: 'selection' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map(nameOf)).toEqual(SELECTION_BAR_ITEMS.map((item) => item.label))
    expect(buttons).toHaveLength(12)

    await user.click(within(toolbar).getByRole('button', { name: 'bold' }))

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalled(), { timeout: 2000 })
    const [, , , savedBlocks, opts] = mockCommitBlocks.mock.calls[0]
    expect((savedBlocks as Block[]).find((b) => b.id === 'b-text')).toEqual({
      id: 'b-text',
      type: 'text',
      content: `Notes on the **${WORDS}** build`,
    })
    expect(opts).toMatchObject({ ownEdit: true })
    expect(within(toolbar).getByRole('button', { name: 'bold' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
