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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
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
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import {
  requestComposerNotice,
  requestComposerToggle,
  requestHtmlImportPicker,
} from '@/lib/terminal-focus'

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
})
