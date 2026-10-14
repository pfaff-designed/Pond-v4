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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { MADE_FROM_THREAD_KEY } from '@/lib/pages/made-from'
import { OPEN_THREAD_MESSAGE_EVENT } from '@/lib/terminal-focus'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { MENTIONED_KEY } from '@/lib/pages/mentioned'
import { workspaceUrl } from '@/lib/pages/nav'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: mockPush }),
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

  it('sets its eyebrow in the SANS — the chip lives on a page, not in the composer', async () => {
    // PROJECT_RULES § two registers, split by medium: the composer's eyebrows are
    // mono, a page's are sans. Board 6a frame 5 measures "made from" in PP Neue
    // Montreal at 10.5px / 500 / .1em / uppercase / ink .68.
    renderPage({ kind: 'page', [MADE_FROM_THREAD_KEY]: STAMP })
    const eyebrow = await screen.findByText('made from')
    expect(eyebrow.className).toBe(pageEyebrowClass)
    expect(eyebrow.className).toMatch(/\bfont-sans\b/)
  })

  it('shows nothing on a page without a stamp', async () => {
    renderPage({ kind: 'page' })
    await screen.findByDisplayValue('renovation blockers')
    expect(screen.queryByText('made from')).not.toBeInTheDocument()
    expect(screen.queryByText(/made from · show/)).not.toBeInTheDocument()
  })
})

// ── the mentioned card (6a frame 5) ─────────────────────────────────────────

describe('the mentioned card on a made page', () => {
  it('renders a row per mention — dot, title, note — as a card and never as prose', async () => {
    renderPage({
      kind: 'page',
      [MADE_FROM_THREAD_KEY]: STAMP,
      [MENTIONED_KEY]: [
        { title: 'cabinet quote', ref: 'cq-1', note: 'the one everything waits on' },
        { title: 'worktop template', ref: null, note: '' },
      ],
    })
    const card = await screen.findByRole('region', { name: 'mentioned' })
    const rows = card.querySelectorAll('[data-part="mentioned-row"]')
    expect(rows).toHaveLength(2)
    expect(within(card).getByText('cabinet quote')).toBeInTheDocument()
    expect(within(card).getByText('the one everything waits on')).toBeInTheDocument()
    // A mention with no note still gets a row, with no empty note element in it.
    expect(rows[1].querySelector('[data-part="mentioned-note"]')).toBeNull()
    // The dot is the existing KindDot mark, one per row.
    expect(card.querySelectorAll('[data-part="dot"]')).toHaveLength(2)
    // It is a card, not prose: no bullet list, no markdown heading left behind.
    expect(card.querySelector('li')).toBeNull()
    expect(card.textContent).not.toContain('######')
  })

  it('draws nothing on a page that mentioned nothing', async () => {
    renderPage({ kind: 'page', [MADE_FROM_THREAD_KEY]: STAMP })
    await screen.findByText('made from')
    expect(screen.queryByRole('region', { name: 'mentioned' })).not.toBeInTheDocument()
  })

  it('opens a mentioned row that resolves to a page; a row that resolves to nothing has no button', async () => {
    renderPage({
      kind: 'page',
      [MADE_FROM_THREAD_KEY]: STAMP,
      [MENTIONED_KEY]: [
        { title: 'cabinet quote', ref: 'cq-1', note: 'the one everything waits on' },
        { title: 'worktop template', ref: null, note: '' },
      ],
    })
    const card = await screen.findByRole('region', { name: 'mentioned' })

    fireEvent.click(within(card).getByRole('button', { name: 'cabinet quote' }))
    expect(mockPush).toHaveBeenCalledWith(
      workspaceUrl({ id: 'cq-1', type: 'page', title: 'cabinet quote' })
    )

    expect(screen.getByText('worktop template')).toBeInTheDocument()
    expect(
      within(card).queryByRole('button', { name: 'worktop template' })
    ).not.toBeInTheDocument()
  })
})
