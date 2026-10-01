/**
 * #97 — the made-from chip on a page made from a streamed answer (`Pond 06.01`
 * 6a frame 5): "made from · tuesday 07:12 — “the question”", linking back to
 * the moment in the thread. **It can be hidden, not removed.**
 *
 * Proves, on the real DocumentPanel: the chip renders from the page's stamp; it
 * opens the thread at the message; hide flips only the flag (persisted through
 * the made-from writer, never a removal) and show brings it back; a page
 * without a stamp shows nothing; and no control anywhere removes it.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { MADE_FROM_THREAD_KEY } from '@/lib/pages/made-from'
import { OPEN_THREAD_MESSAGE_EVENT } from '@/lib/terminal-focus'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn(),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

const mockSetMadeFromHidden = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/made-from', () => ({
  ...jest.requireActual('@/lib/pages/made-from'),
  setMadeFromHidden: (...args: unknown[]) => mockSetMadeFromHidden(...args),
}))

const STAMP = {
  threadId: 'conv-1',
  messageId: 'a1',
  question: 'what is actually blocking the renovation?',
  askedAt: '2026-09-22T07:12:00',
}

function renderPage(props: Record<string, unknown>) {
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: 'kr-1',
    type: 'page',
    title: 'renovation blockers',
    blocks: [{ id: 'b1', type: 'text', content: 'One thing: the cabinet quote.' }],
    props,
    order: 0,
  })
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

describe('the made-from chip', () => {
  it('renders the chip from the stamp and opens the thread at that message', async () => {
    renderPage({ kind: 'page', [MADE_FROM_THREAD_KEY]: STAMP })
    const chip = await screen.findByRole('button', {
      name: 'tuesday 07:12 — “what is actually blocking the renovation?”',
    })
    expect(screen.getByText('made from')).toBeInTheDocument()

    const heard = jest.fn()
    window.addEventListener(OPEN_THREAD_MESSAGE_EVENT, heard)
    fireEvent.click(chip)
    expect(heard).toHaveBeenCalledTimes(1)
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ messageId: 'a1' })
    window.removeEventListener(OPEN_THREAD_MESSAGE_EVENT, heard)
  })

  it('can be hidden — and shown again — but never removed', async () => {
    renderPage({ kind: 'page', [MADE_FROM_THREAD_KEY]: STAMP })
    await screen.findByText('made from')

    // The only controls are hide and (once hidden) show. Nothing removes.
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'hide' }))

    expect(await screen.findByRole('button', { name: 'made from · show' })).toBeInTheDocument()
    expect(screen.queryByText('made from')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(mockSetMadeFromHidden).toHaveBeenCalledWith(expect.anything(), 'page-1', true)
    )

    fireEvent.click(screen.getByRole('button', { name: 'made from · show' }))
    expect(await screen.findByText('made from')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockSetMadeFromHidden).toHaveBeenCalledWith(expect.anything(), 'page-1', false)
    )
  })

  it('a failed hide rolls back — the chip never asserts what the row does not say', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockSetMadeFromHidden.mockRejectedValueOnce(new Error('offline'))
    renderPage({ kind: 'page', [MADE_FROM_THREAD_KEY]: STAMP })
    await screen.findByText('made from')

    fireEvent.click(screen.getByRole('button', { name: 'hide' }))
    await waitFor(() =>
      expect(mockSetMadeFromHidden).toHaveBeenCalledWith(expect.anything(), 'page-1', true)
    )
    // The row never hid it, so the optimistic cache write is rolled back: the chip
    // stays shown rather than asserting a flag the row does not carry.
    await waitFor(() => expect(screen.getByText('made from')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'made from · show' })).not.toBeInTheDocument()
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('shows nothing on a page without a stamp', async () => {
    renderPage({ kind: 'page' })
    await screen.findByDisplayValue('renovation blockers')
    expect(screen.queryByText('made from')).not.toBeInTheDocument()
    expect(screen.queryByText(/made from · show/)).not.toBeInTheDocument()
  })
})
