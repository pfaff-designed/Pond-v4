/**
 * KAN-251 path test — the person's path from PATH_STEPS, walked end to end:
 *   1. all three built doors (the ＋ file input, drag-drop, and the shared
 *      `requestHtmlImportPicker` event) land on the same attached-pill state;
 *   2. Esc mid-read stops it — nothing was sent, no pill/record remains;
 *   3. a 21.4 MB file shows the too-large copy and sends nothing.
 *
 * ＋ in the zen pill is deferred to KAN-186/KAN-193 (no zen pill exists on
 * `main`) and is not exercised here.
 *
 * Same mocked harness as `composer-attachments.test.tsx` (useChat, pond
 * context left unprovided — it defaults safely with no provider — and a
 * query client).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

// Prefixed `mock` so babel-plugin-jest-hoist allows the factory below to
// close over it — overridden per-test to put the ambient nodeId on the
// change log page itself (KAN-96's "request changes from the proposed view").
let mockAmbientNodeId: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({
    get: jest.fn((key: string) => (key === 'nodeId' ? mockAmbientNodeId : null)),
  }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    storage: {
      from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })),
    },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

const mockSendMessage = jest.fn()
// Mutable, read fresh by `useChat` on every call — lets a test stream a
// message in mid-test via `rerender` (KAN-96's revision-stamping test below),
// while every other test here keeps the prior static `[]` by never touching it.
let mockMessages: Array<{
  id: string
  role: string
  parts: Array<Record<string, unknown>>
  metadata?: unknown
}> = []
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { ZenPill } from '@/components/organisms/ZenPill'
import { getPage, listPages } from '@/lib/pages/client'
import {
  requestChanges,
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
} from '@/lib/terminal-focus'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { useZen, ZenComposerChrome, ZenProvider } from '@/lib/layout/zen'

const mockListPages = listPages as jest.Mock
const mockGetPage = getPage as jest.Mock

// ── Helpers ────────────────────────────────────────────────────────────────

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="file"]'))
}

/** The ＋ door's general attach input (accepts html, csv and images, `multiple`). */
function attachInput(container: HTMLElement): HTMLInputElement {
  const input = fileInputs(container).find((i) => i.multiple)
  if (!input) throw new Error('attach input not found')
  return input
}

/** The dedicated html-only input `requestHtmlImportPicker()` clicks. */
function htmlPickerInput(container: HTMLElement): HTMLInputElement {
  const input = fileInputs(container).find((i) => !i.multiple)
  if (!input) throw new Error('html picker input not found')
  return input
}

async function waitReady() {
  await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
}

const smallHtmlFile = () =>
  new File(['<html><body><h1>hi</h1><p>hello</p></body></html>'], 'running-log.html', {
    type: 'text/html',
  })

beforeEach(() => {
  mockSendMessage.mockClear()
  mockAmbientNodeId = null
  mockMessages = []
})

describe('AITerminal — html import path (KAN-251)', () => {
  it('the ＋ file input attaches the html file as a pill', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    // 06.25 frame 1: the pill and both offer chips come up together, with no
    // read and no reading row — the read only starts once the person asks.
    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByText('file it as it is')).toBeInTheDocument()
    expect(screen.queryByText(/reading running-log\.html/)).not.toBeInTheDocument()
  })

  it("the offer chips carry the board's own filled pill, not FollowupChips' outlined variant", async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const chip = screen.getByRole('button', { name: 'make this a page' })
    expect(chip.className).toContain('bg-mn-text/[0.07]')
    expect(chip.className).toContain('rounded-mn-pill')
    expect(chip.className).not.toContain('border-mn-line')
    expect(chip.className).not.toContain('text-[0.72rem]')
  })

  it('the reference pill hugs its content inside a flex-wrap row (board sRefs/sRef), never a full-width bar', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const pill = screen.getByText('running-log.html').parentElement as HTMLElement
    const row = pill.parentElement as HTMLElement
    expect(row.className).toContain('flex')
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('gap-[7px]')
    expect(row.className).not.toContain('flex-col')
    expect(pill.className).toContain('max-w-full')
    expect(pill.className).toContain('bg-mn-text/[0.07]')
    expect(pill.className).not.toContain('bg-mn-wash')
    expect(pill.className).not.toMatch(/max-w-(?!full)/)
  })

  it('dropping the html file on the composer attaches the same pill', async () => {
    renderTerminal()
    await waitReady()

    fireEvent.drop(screen.getByRole('textbox'), { dataTransfer: { files: [smallHtmlFile()] } })

    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByText('file it as it is')).toBeInTheDocument()
    expect(screen.queryByText(/reading running-log\.html/)).not.toBeInTheDocument()
  })

  it('the shared requestHtmlImportPicker event opens the dedicated input and lands on the same pill', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const picker = htmlPickerInput(container)
    const clickSpy = jest.spyOn(picker, 'click')

    requestHtmlImportPicker()
    expect(clickSpy).toHaveBeenCalledTimes(1)

    // The dedicated input has no `multiple`, so it only ever carries one file —
    // simulating what the OS file chooser hands back once the person picks one.
    fireEvent.change(picker, { target: { files: [smallHtmlFile()] } })

    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByText('file it as it is')).toBeInTheDocument()
  })

  it('no read runs until a chip is picked; "make this a page" starts it, and Esc mid-read clears everything', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    // Attached, not yet asked: no read, no reading row.
    expect(screen.queryByText(/reading running-log\.html/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('make this a page'))

    // Still mid-read: the pill and the read chip are up, nothing has settled yet.
    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    expect(screen.getByTestId('read-chip')).toHaveTextContent('running-log.html')
    expect(mockSendMessage).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    // Esc wins the race synchronously: no pill, no read chip, before the read
    // could ever settle. (`startStoppableHtmlRead`'s own unit tests in
    // `html.test.ts` prove the underlying race — that a late settlement is
    // discarded even once the FileReader actually resolves — so this test only
    // has to prove Esc clears the composer's state immediately.)
    expect(screen.queryByText('running-log.html')).not.toBeInTheDocument()
    expect(screen.queryByTestId('read-chip')).not.toBeInTheDocument()
    expect(screen.queryByText(/so far:/)).not.toBeInTheDocument()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('picking "make this a page" with a draft already typed leaves the draft intact', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unsent draft' } })

    fireEvent.click(screen.getByText('make this a page'))

    // The chip is the question, not the draft — the person's own typing is
    // theirs until they send it (AGENTS.md: choices belonging to the user
    // are offered, never made).
    expect(screen.getByRole('textbox')).toHaveValue('unsent draft')
  })

  it('the read chip naming the file and its size is still present after the read settles', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))

    // 6z frame 2 keeps the read chip ON the turn once it settles — it is
    // provenance for the answer, not just a reading indicator.
    await screen.findByText(/So far:/)
    expect(screen.getByTestId('read-chip')).toHaveTextContent('running-log.html · 49 b')
  })

  it('the answer paragraph reads "Reading <filename>." while the read is in flight, then carries the counts once it settles', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))

    // 6z frame 2's `a` is a turn answer from the moment reading starts — the
    // frame the person spends the whole read in must not be blank.
    expect(screen.getByText('Reading running-log.html.')).toBeInTheDocument()

    await screen.findByText(/So far:/)
    expect(screen.queryByText('Reading running-log.html.')).not.toBeInTheDocument()
  })

  it('the read row renders after the answer, and the q row shows a time, matching the board order and the ordinary thread', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))

    const answer = await screen.findByText(/So far:/)
    const readChips = screen.getByTestId('read-chips')
    // Board order is `q → a → readRow`, and the app's own ordinary turns
    // put `read` after the answer too — the import turn must match both.
    expect(
      answer.compareDocumentPosition(readChips) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    const youRow = container.querySelector('[data-part="you-row"]')
    expect(youRow).toHaveTextContent(/\d{2}:\d{2}/)
  })

  it('the settled answer ends in a full stop, matching the board\'s "…and 2 photos." copy', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))

    const answer = await screen.findByText(/So far:/)
    expect(answer.textContent?.trim().endsWith('.')).toBe(true)
  })

  it('"file it as it is" does not start a read — it sends the chip text as the ordinary capture path', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    fireEvent.click(screen.getByText('file it as it is'))

    expect(screen.queryByText(/reading running-log\.html/)).not.toBeInTheDocument()
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('⌘K import a page uncollapses the composer and still opens the dedicated input', async () => {
    const { container } = renderTerminal()
    await waitReady()

    // ⌘J collapses the composer to the tab — the dedicated input unmounts
    // along with the rest of the footer.
    act(() => requestComposerToggle())
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    // The picker input doesn't exist yet to spy on directly, so spy on the
    // prototype: it catches the click once the input remounts and the
    // pending-import effect fires it.
    const clickSpy = jest.spyOn(HTMLInputElement.prototype, 'click')
    act(() => requestHtmlImportPicker())

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument())
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    clickSpy.mockRestore()

    fireEvent.change(htmlPickerInput(container), { target: { files: [smallHtmlFile()] } })

    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByText('file it as it is')).toBeInTheDocument()
  })

  it('⌘K import a page moves focus into the composer once the file lands, not BODY', async () => {
    const { container } = renderTerminal()
    await waitReady()

    act(() => requestHtmlImportPicker())
    fireEvent.change(htmlPickerInput(container), { target: { files: [smallHtmlFile()] } })

    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('a 21.4 MB file shows the too-large copy with both sizes once asked, and sends nothing', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const size = Math.round(21.4 * 1024 * 1024)
    const hugeFile = { name: 'huge.html', type: 'text/html', size } as unknown as File
    fireEvent.change(attachInput(container), { target: { files: [hugeFile] } })

    fireEvent.click(screen.getByText('make this a page'))

    // 06.25 frame 6: the board's `a` copy is sentence case (only the chip/
    // line strings are lowercase), and its unit is uppercase ("64 MB",
    // "up to 20 MB") — `formatBytes(..., 'upper')` matches that here.
    await screen.findByText(
      /is 21\.4 MB\. I can read html files up to 20 MB\. Split it, or keep it as a file\./
    )
    expect(screen.getByText('keep it as a file')).toBeInTheDocument()
    expect(screen.queryByText('try another file')).not.toBeInTheDocument()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('typing and sending under a too-large failure while offline leaves the failure on screen and never brings the offer back', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const size = Math.round(21 * 1024 * 1024)
    const hugeFile = { name: 'huge.html', type: 'text/html', size } as unknown as File
    fireEvent.change(attachInput(container), { target: { files: [hugeFile] } })
    fireEvent.click(screen.getByText('make this a page'))
    const failure = await screen.findByText(
      /is 21 MB\. I can read html files up to 20 MB\. Split it, or keep it as a file\./
    )

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'something else' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    onLineSpy.mockRestore()

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(failure).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'make this a page' })).not.toBeInTheDocument()
  })

  it('picking "keep it as a file" under a too-large failure while offline takes the ordinary send path and leaves the failure on screen', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const size = Math.round(21 * 1024 * 1024)
    const hugeFile = { name: 'huge.html', type: 'text/html', size } as unknown as File
    fireEvent.change(attachInput(container), { target: { files: [hugeFile] } })
    fireEvent.click(screen.getByText('make this a page'))
    const failure = await screen.findByText(
      /is 21 MB\. I can read html files up to 20 MB\. Split it, or keep it as a file\./
    )

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.click(screen.getByText('keep it as a file'))
    onLineSpy.mockRestore()

    // A settled read leaves no ask about the file to block, so the chip is
    // an ordinary send. The first ask's `q` row still reads "make this a
    // page" as text; only the offer chip is a button.
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(failure).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'make this a page' })).not.toBeInTheDocument()
  })

  it('a 20.03 MB file just over the limit reads 20.1 MB, never the same 20 MB figure as the limit', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const size = 21_000_059
    const edgeFile = { name: 'edge.html', type: 'text/html', size } as unknown as File
    fireEvent.change(attachInput(container), { target: { files: [edgeFile] } })

    fireEvent.click(screen.getByText('make this a page'))

    await screen.findByText(
      /is 20\.1 MB\. I can read html files up to 20 MB\. Split it, or keep it as a file\./
    )
  })

  it('an empty/non-html file shows the unreadable failure copy, sentence case, with both chips', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const emptyFile = new File([''], 'notes.html', { type: 'text/html' })
    fireEvent.change(attachInput(container), { target: { files: [emptyFile] } })

    fireEvent.click(screen.getByText('make this a page'))

    await screen.findByText(
      'I can’t read notes.html: it’s empty, or it isn’t html. Nothing was made.'
    )
    expect(screen.getByText('keep it as a file')).toBeInTheDocument()
    expect(screen.getByText('try another file')).toBeInTheDocument()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it("the failure chips carry the board's own filled pill (same as the offer chips), not the outlined variant, with a 44px phone target", async () => {
    const { container } = renderTerminal()
    await waitReady()

    const emptyFile = new File([''], 'notes.html', { type: 'text/html' })
    fireEvent.change(attachInput(container), { target: { files: [emptyFile] } })
    fireEvent.click(screen.getByText('make this a page'))
    await screen.findByText('keep it as a file')

    const offerClassName = 'bg-mn-text/[0.07]'
    for (const name of ['keep it as a file', 'try another file']) {
      const chip = screen.getByRole('button', { name })
      expect(chip.className).toContain(offerClassName)
      expect(chip.className).toContain('rounded-mn-pill')
      expect(chip.className).toContain('max-md:h-11')
      expect(chip.className).not.toContain('border-mn-line')
      expect(chip.className).not.toContain('text-[0.72rem]')
      expect((chip.parentElement as HTMLElement).className).toContain('gap-[7px]')
    }
  })

  it('announces the failure sentence through a polite live region', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const emptyFile = new File([''], 'notes.html', { type: 'text/html' })
    fireEvent.change(attachInput(container), { target: { files: [emptyFile] } })
    fireEvent.click(screen.getByText('make this a page'))

    const failureText = await screen.findByText(
      'I can’t read notes.html: it’s empty, or it isn’t html. Nothing was made.'
    )
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion).toContainElement(failureText)
  })

  it('the settled answer follows board sAnswer: 1.55 leading, 15px on a phone, no tracking', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))
    const answer = await screen.findByText(/So far:/)

    expect(answer).toHaveClass('leading-[1.55]', 'text-[13.5px]', 'max-md:text-[15px]')
    expect(answer.className).not.toMatch(/tracking-/)
  })

  it('the failure answer follows board sAnswer: 1.55 leading, 15px on a phone, no tracking', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const emptyFile = new File([''], 'notes.html', { type: 'text/html' })
    fireEvent.change(attachInput(container), { target: { files: [emptyFile] } })
    fireEvent.click(screen.getByText('make this a page'))
    const answer = await screen.findByText(/I can’t read notes\.html/)

    expect(answer).toHaveClass('leading-[1.55]', 'text-[13.5px]', 'max-md:text-[15px]')
    expect(answer.className).not.toMatch(/tracking-/)
  })

  it('picking "try another file" clears the pill and opens the html chooser', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const emptyFile = new File([''], 'notes.html', { type: 'text/html' })
    fireEvent.change(attachInput(container), { target: { files: [emptyFile] } })
    fireEvent.click(screen.getByText('make this a page'))
    await screen.findByText('try another file')

    const clickSpy = jest.spyOn(htmlPickerInput(container), 'click')
    fireEvent.click(screen.getByText('try another file'))

    expect(screen.queryByText('notes.html')).not.toBeInTheDocument()
    expect(screen.queryByText('try another file')).not.toBeInTheDocument()
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('picking "make this a page" while offline renders the offline note as a turn, with no failure chips, and sends nothing', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.click(screen.getByText('make this a page'))
    onLineSpy.mockRestore()

    // 06.25 frame 6: offline is a turn's `note`, not its `a` — no failure
    // chips, the pill stays attached, and nothing was ever read or sent.
    expect(screen.getByText('running-log.html')).toBeInTheDocument()
    const note = screen.getByText(
      'asking needs a connection. running-log.html stays attached; nothing is sent until you’re back online.'
    )
    expect(note).toBeInTheDocument()
    // Board `sNote` is `{ fontSize: 11, color: a(.68) }` — it sets no letter-spacing.
    expect(note.className).not.toMatch(/tracking-/)
    expect(screen.queryByText(/reading running-log\.html/)).not.toBeInTheDocument()
    expect(screen.queryByText('keep it as a file')).not.toBeInTheDocument()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('asking again once back online actually starts the read, instead of falling through to a bare send', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.click(screen.getByText('make this a page'))
    onLineSpy.mockRestore()

    await screen.findByText(
      'asking needs a connection. running-log.html stays attached; nothing is sent until you’re back online.'
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    // Back online: the `make this a page` chip must still be on screen (the
    // one offline attempt must not have hidden it for good), and picking it
    // must actually start a read rather than falling through to `sendText`.
    // (The offline note's own `q` also reads "make this a page", so the chip
    // button is matched by role rather than by its text alone.)
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))

    await screen.findByText(/So far:/)
    expect(screen.getByTestId('read-chip')).toHaveTextContent('running-log.html · 49 b')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('typing and sending once back online also starts the read, not a bare sendText', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.click(screen.getByText('make this a page'))
    onLineSpy.mockRestore()

    await screen.findByText(
      'asking needs a connection. running-log.html stays attached; nothing is sent until you’re back online.'
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'what is in it' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await screen.findByText(/So far:/)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('sending while offline mid-read takes the ordinary send path: the turn keeps its q and no offline note appears', async () => {
    const readSpy = jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => {})
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))
    expect(screen.getByTestId('read-chip')).toHaveTextContent('running-log.html')

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'what is in it' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    onLineSpy.mockRestore()
    readSpy.mockRestore()

    expect(screen.queryByText(/asking needs a connection/)).not.toBeInTheDocument()
    // Mid-read the offer chips are gone, so the one match is the turn's q.
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByText(/reading running-log\.html/i)).toBeInTheDocument()
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('attaching a fresh file while the offline note is showing clears the note', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.click(screen.getByText('make this a page'))
    onLineSpy.mockRestore()

    expect(
      screen.getByText(
        'asking needs a connection. running-log.html stays attached; nothing is sent until you’re back online.'
      )
    ).toBeInTheDocument()

    const other = new File(['<html><body>other</body></html>'], 'other.html', {
      type: 'text/html',
    })
    fireEvent.change(attachInput(container), { target: { files: [other] } })

    expect(
      screen.queryByText(
        'asking needs a connection. running-log.html stays attached; nothing is sent until you’re back online.'
      )
    ).not.toBeInTheDocument()
  })

  it('picking the other chip once back online leaves no stale turn and restores the frame 1 placeholder', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    const onLineSpy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    fireEvent.click(screen.getByText('make this a page'))
    onLineSpy.mockRestore()

    await screen.findByText(
      'asking needs a connection. running-log.html stays attached; nothing is sent until you’re back online.'
    )

    // Back online: pick the OTHER chip, not the one just asked offline.
    fireEvent.click(screen.getByText('file it as it is'))

    // The offline attempt's turn (its `q` row and live region) must be gone
    // entirely — not left behind with an empty answer.
    expect(container.querySelector('[data-part="you-row"]')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // The offer chips are back (no read ran), and the placeholder is frame 1,
    // not the global default.
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ask about running-log.html')).toBeInTheDocument()
  })

  it("the composer line placeholder follows 06.25's own text across attach, reading and a failure", async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })

    // Frame 1: attached, not yet asked.
    expect(screen.getByPlaceholderText('ask about running-log.html')).toBeInTheDocument()

    fireEvent.click(screen.getByText('make this a page'))

    // Frame 2: reading.
    expect(screen.getByPlaceholderText('esc to stop')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    // Attach an unreadable file to reach frame 6's failure placeholder.
    const emptyFile = new File([''], 'notes.html', { type: 'text/html' })
    fireEvent.change(attachInput(container), { target: { files: [emptyFile] } })
    fireEvent.click(screen.getByText('make this a page'))

    await screen.findByText(
      'I can’t read notes.html: it’s empty, or it isn’t html. Nothing was made.'
    )
    expect(screen.getByPlaceholderText('reply, or ask something else')).toBeInTheDocument()
  })

  // KAN-251 10098: removing the pill (not Esc, not "try another file") must
  // not take the question/answer with it — PROJECT_RULES says answers live
  // in the thread. Only a settled read (ok or failed) has anything to keep.
  it('removing the pill after a settled read keeps the question and answer in the thread', async () => {
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))
    await screen.findByText(/So far:/)

    fireEvent.click(screen.getByRole('button', { name: 'Remove running-log.html' }))

    expect(screen.queryByText('running-log.html')).not.toBeInTheDocument()
    expect(screen.getByText('make this a page')).toBeInTheDocument()
    expect(screen.getByText(/So far:/)).toBeInTheDocument()
    expect(screen.getByTestId('read-chip')).toHaveTextContent('running-log.html · 49 b')
  })

  it('removing the pill after a too-large failure keeps the failure sentence but drops its chip', async () => {
    const { container } = renderTerminal()
    await waitReady()

    const size = Math.round(21.4 * 1024 * 1024)
    const hugeFile = { name: 'huge.html', type: 'text/html', size } as unknown as File
    fireEvent.change(attachInput(container), { target: { files: [hugeFile] } })
    fireEvent.click(screen.getByText('make this a page'))

    await screen.findByText(
      /is 21\.4 MB\. I can read html files up to 20 MB\. Split it, or keep it as a file\./
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove huge.html' }))

    expect(
      screen.getByText(
        /is 21\.4 MB\. I can read html files up to 20 MB\. Split it, or keep it as a file\./
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('keep it as a file')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove huge.html' })).not.toBeInTheDocument()
  })

  it('removing the pill mid-read keeps nothing, same as Esc — there is no answer yet', async () => {
    const readSpy = jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => {})
    const { container } = renderTerminal()
    await waitReady()

    fireEvent.change(attachInput(container), { target: { files: [smallHtmlFile()] } })
    fireEvent.click(screen.getByText('make this a page'))
    expect(screen.getByTestId('read-chip')).toHaveTextContent('running-log.html')

    fireEvent.click(screen.getByRole('button', { name: 'Remove running-log.html' }))
    readSpy.mockRestore()

    expect(screen.queryByText('running-log.html')).not.toBeInTheDocument()
    expect(screen.queryByTestId('read-chip')).not.toBeInTheDocument()
    expect(screen.queryByText('make this a page')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="you-row"]')).not.toBeInTheDocument()
  })
})

describe('AITerminal — the composer notice bridge (KAN-93)', () => {
  it('dispatching the notice event shows its text in the composer, mono and lowercase', async () => {
    renderTerminal()
    await waitReady()

    act(() => {
      requestComposerNotice("can't undo — the page changed since. revert it from the change log.")
    })

    const notice = await screen.findByText(
      "can't undo — the page changed since. revert it from the change log."
    )
    expect(notice.className).toContain('font-mono')
    expect(notice.className).toContain('lowercase')
  })

  it('a later empty text clears a stale notice — a done ⌘Z does not keep saying it refused', async () => {
    renderTerminal()
    await waitReady()

    act(() => {
      requestComposerNotice("can't undo — the page changed since. revert it from the change log.")
    })
    await screen.findByText("can't undo — the page changed since. revert it from the change log.")

    act(() => {
      requestComposerNotice('')
    })

    expect(
      screen.queryByText("can't undo — the page changed since. revert it from the change log.")
    ).not.toBeInTheDocument()
  })
})

describe('AITerminal — the @ mention picker opens, narrows and closes (KAN-99)', () => {
  const MENTION_PAGES = [
    {
      id: 'p1',
      parentId: null,
      type: 'page',
      title: 'kitchen renovation',
      blocks: [],
      order: 0,
      props: {},
    },
    {
      id: 'p2',
      parentId: null,
      type: 'page',
      title: 'budget planning',
      blocks: [],
      order: 1,
      props: {},
    },
  ]

  beforeEach(() => {
    mockListPages.mockResolvedValue(MENTION_PAGES)
    window.localStorage.clear()
  })

  afterEach(() => {
    mockListPages.mockResolvedValue([])
    window.localStorage.clear()
  })

  it('opens headed "pages" on @, narrows on further typing, and Escape closes it keeping the text', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, '@')

    expect(await screen.findByText('pages')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /kitchen renovation/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /budget planning/ })).toBeInTheDocument()

    await user.type(textbox, 'kit')

    expect(screen.getByRole('option', { name: /kitchen renovation/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /budget planning/ })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByText('pages')).not.toBeInTheDocument()
    expect(textbox).toHaveValue('@kit')
  })

  it('picking a row replaces the typed @query with the title and adds a title-only chip', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, '@kit')
    await screen.findByRole('option', { name: /kitchen renovation/ })

    await user.keyboard('{Enter}')

    expect(screen.queryByText('pages')).not.toBeInTheDocument()
    expect(textbox).toHaveValue('@kitchen renovation ')
    await waitFor(() =>
      expect((textbox as HTMLTextAreaElement).selectionStart).toBe('@kitchen renovation '.length)
    )

    const refs = screen.getByRole('group', { name: 'references' })
    expect(refs).toHaveTextContent('kitchen renovation')
    expect(refs).not.toHaveTextContent('—')
  })

  it('↓↓↑ leaves row 2 active — the keyup after an arrow key does not reset the highlight to row 1', async () => {
    mockListPages.mockResolvedValue([
      ...MENTION_PAGES,
      { id: 'p3', parentId: null, type: 'page', title: 'garden layout', blocks: [], order: 2, props: {} },
    ])
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, '@')
    await screen.findByText('pages')

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowUp}')

    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('zero matches: the glass does not open at all, and Enter sends (AUDIT G6)', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, '@zzz')

    expect(screen.queryByText('pages')).not.toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()

    await user.keyboard('{Enter}')

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('sorts a recently-visited page above an unrelated match (orderMentionPages wiring)', async () => {
    window.localStorage.setItem(
      'pond:recent-pages',
      JSON.stringify([{ id: 'p2', type: 'page', title: 'budget planning' }])
    )
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, '@')
    await screen.findByText('pages')

    const options = screen.getAllByRole('option').map((o) => o.textContent)
    const recentIndex = options.findIndex((t) => t?.includes('budget planning'))
    const unrelatedIndex = options.findIndex((t) => t?.includes('kitchen renovation'))
    expect(recentIndex).toBeGreaterThanOrEqual(0)
    expect(recentIndex).toBeLessThan(unrelatedIndex)
  })
})

describe('AITerminal — REQUEST_CHANGES_EVENT before the thread is ready (KAN-96)', () => {
  afterEach(() => {
    mockListPages.mockResolvedValue([])
  })

  it('a request made while still loading is sent once, once ready', async () => {
    renderTerminal()

    act(() => {
      requestChanges({ toolCallId: 'tc-1', note: 'please fix the heading', reason: 'note' })
    })
    expect(mockSendMessage).not.toHaveBeenCalled()

    await waitReady()
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'please fix the heading' }),
      expect.anything()
    )
  })

  it('a view-originated request names the record\'s page, not the change log', async () => {
    mockAmbientNodeId = CHANGE_LOG_NODE_ID
    renderTerminal()
    await waitReady()

    act(() => {
      requestChanges({
        toolCallId: 'tc-2',
        note: 'please fix the heading',
        reason: 'note',
        targetPageId: 'page-77',
      })
    })

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.objectContaining({ nodeId: 'page-77', nodeType: 'page' }),
      })
    )
  })

  // The revised propose_changes batch streams back with no `targetPageId` of
  // its own (Pond's revision doesn't re-state it) — the stamping effect must
  // still resolve it against the record's page, not the ambient '__change_log__'
  // node the composer happened to be parked on when the note was sent.
  it("stamps and labels a revised batch against the record's page, not the change log", async () => {
    mockAmbientNodeId = CHANGE_LOG_NODE_ID
    mockListPages.mockResolvedValueOnce([
      { id: 'page-77', parentId: null, type: 'page', title: 'Recipe', blocks: [], order: 0, props: {} },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    await waitReady()
    await waitFor(() => expect(mockListPages).toHaveBeenCalled())
    await act(async () => {})

    act(() => {
      requestChanges({
        toolCallId: 'tc-old',
        note: 'please fix the heading',
        reason: 'note',
        targetPageId: 'page-77',
      })
    })
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [[sentMessage]] = mockSendMessage.mock.calls
    const sentMetadata = sentMessage.metadata

    mockMessages = [
      {
        id: 'm-note',
        role: 'user',
        parts: [{ type: 'text', text: 'please fix the heading' }],
        metadata: sentMetadata,
      },
      {
        id: 'm-revision',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Updated the heading.' },
          {
            type: 'tool-propose_changes',
            toolCallId: 'tc-new',
            state: 'input-available',
            input: {
              changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'Hello moon' } }],
            },
          },
        ],
      },
    ]
    rerender(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )

    await waitFor(() => expect(screen.getByText(/— Recipe/)).toBeInTheDocument())
    expect(screen.queryByText(/— change log/)).not.toBeInTheDocument()

    // The revised answer's read chip must name the record's page, not the
    // ambient pond/contextLabel it happened to stream back against (KAN-96).
    const chipLabels = screen.getAllByTestId('read-chip').map((el) => el.textContent)
    expect(chipLabels).toEqual(['Recipe'])
  })
})

describe('AITerminal — tool-only answers still show their read chips (KAN-317)', () => {
  it('a propose_changes-only answer (no text, no sources) shows a read row under the card', async () => {
    mockMessages = [
      { id: 'm-ask', role: 'user', parts: [{ type: 'text', text: 'add a line saying hello' }] },
      {
        id: 'm-answer',
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_changes',
            toolCallId: 'tc-tool-only',
            state: 'input-available',
            input: {
              changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'hello' } }],
            },
          },
        ],
      },
    ]
    renderTerminal()
    await waitReady()

    const card = screen.getByRole('group', { name: '1 diff' })
    const readRow = screen.getByTestId('read-chips')
    expect(screen.getAllByTestId('read-chip').length).toBeGreaterThan(0)
    expect(card.compareDocumentPosition(readRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a revised card with no text part still shows its read row under it, labeled for the record\'s page', async () => {
    mockAmbientNodeId = CHANGE_LOG_NODE_ID
    mockListPages.mockResolvedValueOnce([
      { id: 'page-77', parentId: null, type: 'page', title: 'Recipe', blocks: [], order: 0, props: {} },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    await waitReady()
    await waitFor(() => expect(mockListPages).toHaveBeenCalled())
    await act(async () => {})

    act(() => {
      requestChanges({
        toolCallId: 'tc-old',
        note: 'please fix the heading',
        reason: 'note',
        targetPageId: 'page-77',
      })
    })
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [[sentMessage]] = mockSendMessage.mock.calls
    const sentMetadata = sentMessage.metadata

    mockMessages = [
      {
        id: 'm-note',
        role: 'user',
        parts: [{ type: 'text', text: 'please fix the heading' }],
        metadata: sentMetadata,
      },
      {
        id: 'm-revision',
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_changes',
            toolCallId: 'tc-new',
            state: 'input-available',
            input: {
              changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'Hello moon' } }],
            },
          },
        ],
      },
    ]
    rerender(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )

    const card = await screen.findByRole('group', { name: '1 diff' })
    const readRow = screen.getByTestId('read-chips')
    expect(card.compareDocumentPosition(readRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // The revised, text-less card's read chip must still name the record's
    // page, not the ambient contextLabel/change-log node the note was sent
    // against (KAN-96's rule, now also proven for a tool-only answer).
    const chipLabels = screen.getAllByTestId('read-chip').map((el) => el.textContent)
    expect(chipLabels).toEqual(['Recipe'])
  })

  // Path test (PATH_STEPS 1-3): a person types into the composer and sends —
  // the stream resolving to a tool-only propose_changes answer must show its
  // read row under the card in the live thread, not just in a hand-built fixture.
  it('typing a question and sending it: a tool-only answer shows its read row in the live thread', async () => {
    // PATH_STEP 1 — a page is open, so the turn has something to read.
    mockAmbientNodeId = 'page-scratch'
    mockGetPage.mockResolvedValueOnce({
      id: 'page-scratch',
      parentId: null,
      type: 'page',
      title: 'Scratch',
      blocks: [],
      order: 0,
      props: {},
    })
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    await waitReady()
    await waitFor(() => expect(mockGetPage).toHaveBeenCalled())

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, 'add a line saying hello to this page')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [[sentMessage]] = mockSendMessage.mock.calls

    mockMessages = [
      {
        id: 'm-ask',
        role: 'user',
        parts: [{ type: 'text', text: 'add a line saying hello to this page' }],
        metadata: sentMessage.metadata,
      },
      {
        id: 'm-answer',
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_changes',
            toolCallId: 'tc-live',
            state: 'input-available',
            input: {
              changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'hello' } }],
            },
          },
        ],
      },
    ]
    rerender(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )

    const card = await screen.findByRole('group', { name: '1 diff' })
    const readRow = screen.getByTestId('read-chips')
    expect(screen.getAllByTestId('read-chip').length).toBeGreaterThan(0)
    expect(card.compareDocumentPosition(readRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('"close" always reachable in zen (KAN-186, 6q f8)', () => {
  function renderInZen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const root = React.createRef<HTMLDivElement>()
    const Entered = () => {
      const { enterZen } = useZen()
      return (
        <>
          <button onClick={() => enterZen({ onInk: false })}>enter</button>
          <ZenComposerChrome>
            <QueryClientProvider client={queryClient}>
              <AITerminal />
            </QueryClientProvider>
          </ZenComposerChrome>
          <ZenPill />
        </>
      )
    }
    const view = render(
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Entered />
        </ZenProvider>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    return view
  }

  it('still shows "close" as exactly one control set once a thread has more than one turn (KAN-325: the old zen-close-row is gone)', async () => {
    mockMessages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'what should i cook' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'pasta' }] },
      { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'what else' }] },
      { id: 'm4', role: 'assistant', parts: [{ type: 'text', text: 'salad' }] },
      { id: 'm5', role: 'user', parts: [{ type: 'text', text: 'and dessert' }] },
      { id: 'm6', role: 'assistant', parts: [{ type: 'text', text: 'cake' }] },
    ]
    renderInZen()
    await waitReady()

    expect(screen.getAllByRole('button', { name: 'close' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'close' })).not.toBeInTheDocument())
  })
})

describe('zen close with a pending proposal (KAN-325)', () => {
  function renderInZen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const root = React.createRef<HTMLDivElement>()
    const Entered = () => {
      const { enterZen } = useZen()
      return (
        <>
          <button onClick={() => enterZen({ onInk: false })}>enter</button>
          <ZenComposerChrome>
            <QueryClientProvider client={queryClient}>
              <AITerminal />
            </QueryClientProvider>
          </ZenComposerChrome>
          <ZenPill />
        </>
      )
    }
    const view = render(
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Entered />
        </ZenProvider>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    return view
  }

  it('closes the card even while a proposal is still pending, and the proposal is still pending on reopen', async () => {
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'change alpha to apple' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_changes',
            toolCallId: 'pc1',
            state: 'input-available',
            input: {
              changes: [{ op: 'create', data: { type: 'text', content: 'apple one' } }],
            },
          },
        ],
      },
    ]
    renderInZen()
    await waitReady()

    const askPond = screen.getByRole('button', { name: 'ask pond' })
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))

    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()

    // An explicit close click overrides the hold outright — the diff stays
    // proposed in the change log, only the card closes (KAN-325, same bypass
    // as KAN-318's `closedByPerson`).
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))

    // Reopening (the mark again) shows the same pending card — untouched.
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('group', { name: '1 diff' })).toBeInTheDocument()
  })
})

describe('Esc order inside zen (KAN-186)', () => {
  function renderInZen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const root = React.createRef<HTMLDivElement>()
    const Entered = () => {
      const { enterZen } = useZen()
      return (
        <>
          <button onClick={() => enterZen({ onInk: false })}>enter</button>
          <ZenComposerChrome>
            <QueryClientProvider client={queryClient}>
              <AITerminal />
            </QueryClientProvider>
          </ZenComposerChrome>
          <ZenPill />
        </>
      )
    }
    const view = render(
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Entered />
        </ZenProvider>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    return view
  }

  it('closes the card first, and only a second Esc (nothing left to consume it) leaves zen', async () => {
    mockMessages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'what should i cook' }] },
    ]
    renderInZen()
    await waitReady()

    // PATH_STEP 1 — zen starts quiet: the mark is at rest, nothing asked.
    const askPond = screen.getByRole('button', { name: 'ask pond' })
    expect(askPond).toHaveAttribute('aria-pressed', 'false')

    // PATH_STEP 8 — the first Pond-mark press is what opens the card.
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))

    const textbox = screen.getByRole('textbox')
    textbox.focus()
    fireEvent.keyDown(textbox, { key: 'Escape' })

    // First Esc: the card closes, but zen itself is untouched.
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.getByRole('button', { name: 'leave' })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'Escape' })

    // Second Esc: nothing left to consume it, so this is the one that leaves zen.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'leave' })).not.toBeInTheDocument()
    )
  })
})

describe('⌘J inside zen (KAN-186)', () => {
  function renderInZen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const root = React.createRef<HTMLDivElement>()
    const Entered = () => {
      const { enterZen } = useZen()
      return (
        <>
          <button onClick={() => enterZen({ onInk: false })}>enter</button>
          <ZenComposerChrome>
            <QueryClientProvider client={queryClient}>
              <AITerminal />
            </QueryClientProvider>
          </ZenComposerChrome>
          <ZenPill />
        </>
      )
    }
    const view = render(
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Entered />
        </ZenProvider>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    return view
  }

  it('shows the card and the mark goes active; pressed again, it closes', async () => {
    renderInZen()
    await waitReady()

    const askPond = screen.getByRole('button', { name: 'ask pond' })
    expect(askPond).toHaveAttribute('aria-pressed', 'false')

    act(() => requestComposerToggle())
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))

    act(() => requestComposerToggle())
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))
  })
})

describe('leaving zen restores the composer’s open state (KAN-186)', () => {
  function renderInZen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const root = React.createRef<HTMLDivElement>()
    const Entered = () => {
      const { enterZen } = useZen()
      return (
        <>
          <button onClick={() => enterZen({ onInk: false })}>enter</button>
          <ZenComposerChrome>
            <QueryClientProvider client={queryClient}>
              <AITerminal />
            </QueryClientProvider>
          </ZenComposerChrome>
          <ZenPill />
        </>
      )
    }
    return render(
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Entered />
        </ZenProvider>
      </div>
    )
  }

  it('composer open → enter zen → open and close the card → leave zen → the composer is open again', async () => {
    renderInZen()
    await waitReady()

    // The composer starts open regardless of zen (its own default).
    expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    const askPond = screen.getByRole('button', { name: 'ask pond' })
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))

    // Pressing the mark again calls the same `collapseComposer` a dedicated
    // close button used to — it is this collapse, not zen itself, the fix
    // must undo on leave.
    fireEvent.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))

    fireEvent.click(screen.getByRole('button', { name: 'leave' }))

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeInTheDocument()
    )
  })
})

describe('reopening the composer actually moves focus into the input (KAN-323)', () => {
  it('⌘J does not focus the still-collapsed textarea, and focuses it once the reopen commits', async () => {
    renderTerminal()
    await waitReady()

    act(() => requestComposerToggle())
    const card = document.querySelector('[data-part="composer-card"]')
    expect(card).toHaveAttribute('data-collapsed')

    const focusSpy = jest.spyOn(HTMLTextAreaElement.prototype, 'focus')

    requestComposerToggle()
    expect(focusSpy).not.toHaveBeenCalled()
    expect(card).toHaveAttribute('data-collapsed')

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })
})
