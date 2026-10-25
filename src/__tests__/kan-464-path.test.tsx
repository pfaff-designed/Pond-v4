/**
 * KAN-464's own PATH_STEPS, walked on the real `DocumentPanel`: a page opens
 * with a pending title-focus request claimed, a long title is typed, Return
 * leaves to the body's fresh first line, text is typed there, and ArrowUp on
 * that line's first visual line (jsdom has no layout, so `endOfTextblock` is
 * stubbed, per KAN-369's own `next-block.test.ts`) lands the caret back at
 * the title's end. Mocks copy `document-panel-title-focus.test.tsx`'s own
 * harness, the test this ticket's item 4 already proved the request-claim
 * half of this path with.
 */

import React from 'react'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestTitleFocus } from '@/lib/pages/title-focus'
import { findTextBlock, textEditorOf } from './helpers/text-block'

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
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: '', blocks: [], props: {} })
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

describe('PATH_STEPS — a new page opens in its title, Return reaches the body, ArrowUp returns (KAN-464/KAN-369)', () => {
  it('walks the whole path: request, type, Return, type, ArrowUp back to the title end', async () => {
    requestTitleFocus('page-1')
    renderPanel()
    const user = userEvent.setup()

    // Step 1: the caret is already in the title, no click.
    const title = (await screen.findByLabelText('Page title')) as HTMLTextAreaElement
    await waitFor(() => expect(title).toHaveFocus())

    // Step 2: a long title wraps rather than clipping — covered for layout by
    // `PageTitleRow.stories.tsx`'s `LongTitleWraps`; this walk only needs the
    // typed value to land intact.
    const longTitle = 'Kitchen renovation plan for the spring'
    await user.type(title, longTitle)
    expect(title.value).toBe(longTitle)

    // Step 3: Return leaves the title for a fresh first line in the body.
    await user.keyboard('{Enter}')
    const line = await findTextBlock()
    await waitFor(() => expect(line).toHaveFocus())

    // Step 4: type in that line (via the editor's own command, since
    // ProseMirror's mousedown handling calls `elementFromPoint`, which jsdom
    // doesn't implement — the same reason `kan-506-path.test.tsx` drives
    // typing this way), then ArrowUp on its first (and only) visual line
    // hands the caret back to the end of the title. jsdom has no layout, so
    // `endOfTextblock` is stubbed true, same as `next-block.test.ts`.
    const editor = textEditorOf(line)
    act(() => editor.commands.insertContent('simmer the stock'))
    editor.view.endOfTextblock = () => true
    fireEvent.keyDown(line, { key: 'ArrowUp' })

    await waitFor(() => expect(title).toHaveFocus())
    expect(title.selectionStart).toBe(longTitle.length)
    expect(title.selectionEnd).toBe(longTitle.length)
  })
})
