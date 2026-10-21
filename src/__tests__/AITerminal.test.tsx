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

import React, { useEffect } from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'

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

// KAN-341: the root's own id, the same mock `first-run-path.test.tsx` uses.
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
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

// KAN-341 (accept item): the real write path hits Supabase well past what
// this file otherwise mocks — stub it so "accept" can be clicked and its
// `openNodeId` argument inspected directly, the same way `mockSendMessage`
// stands in for the real chat request.
jest.mock('@/lib/pages/accept', () => ({
  writeAcceptedChanges: jest
    .fn()
    .mockResolvedValue({ applied: 1, skipped: 0, skippedReasons: [], targetId: 'home-1', recordId: null }),
}))

// KAN-341 (acceptConfigureView fix): stub the write so a linked configure_view
// card's accept can be clicked and `pageId` (the write's host) inspected directly —
// `resolveCollectionByName` stays real, it's a pure name lookup over `allPages`.
jest.mock('@/lib/pages/configure-view', () => ({
  ...jest.requireActual('@/lib/pages/configure-view'),
  configureViewFromProposal: jest.fn().mockResolvedValue({ id: 'view-1', replaced: false }),
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
const mockRegenerate = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
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
  requestTerminalFocus,
} from '@/lib/terminal-focus'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { useZen, ZenComposerChrome, ZenProvider } from '@/lib/layout/zen'
import { COMPOSER_CLEARANCE_VAR } from '@/lib/layout/composer-clearance'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { configureViewFromProposal } from '@/lib/pages/configure-view'
import { resolveAcceptTarget } from '@/lib/conversation/resolutions'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { clearSelection, selectWord } from './helpers/selection'

const mockListPages = listPages as jest.Mock
const mockGetPage = getPage as jest.Mock
const mockWriteAcceptedChanges = writeAcceptedChanges as jest.Mock
const mockConfigureViewFromProposal = configureViewFromProposal as jest.Mock

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

/** A registered, editable text-block editor standing in for a real page block — the bar only opens inside one. */
function PassageBlockHost() {
  const editor = useEditor({
    extensions: proseExtensions,
    content: '<p>hello garden</p>',
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    return registerTextEditor(editor)
  }, [editor])

  if (!editor) return null
  return (
    <div data-block-id="home-block-1">
      <EditorContent editor={editor} />
    </div>
  )
}

/** `waitReady`, but disambiguated by name — `PassageBlockHost`'s own editor is a second `textbox`. */
async function waitComposerReady() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).not.toBeDisabled())
}

beforeEach(() => {
  mockSendMessage.mockClear()
  mockRegenerate.mockClear()
  mockWriteAcceptedChanges.mockClear()
  mockConfigureViewFromProposal.mockClear()
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

describe('AITerminal — the root page sends its own id (KAN-341)', () => {
  it('at the root (no ?nodeId=), sendMessage\'s body carries the home row\'s id', async () => {
    renderTerminal()
    await waitReady()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'what is on this page' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.objectContaining({ nodeId: 'home-1' }),
      })
    )
  })
})

describe("AITerminal — the root page's contextLabel resolves to the home title (KAN-341)", () => {
  it('currentPage fires with the home id, and the read chip names the home row once it loads', async () => {
    mockGetPage.mockResolvedValueOnce({
      id: 'home-1',
      parentId: null,
      type: 'home',
      title: 'Garden Life',
      blocks: [],
      order: 0,
      props: {},
    })
    mockMessages = [
      { id: 'm-ask', role: 'user', parts: [{ type: 'text', text: 'what is on this page' }] },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'Here is what is on it.' }] },
    ]
    renderTerminal()
    await waitReady()

    await waitFor(() => expect(mockGetPage).toHaveBeenCalledWith(expect.anything(), 'home-1'))
    await waitFor(() =>
      expect(screen.getAllByTestId('read-chip').map((el) => el.textContent)).toContain(
        'Garden Life'
      )
    )
  })
})

describe('AITerminal — a dismissed current-page chip comes back on a later visit (KAN-341)', () => {
  it('dismiss on A, open B, reopen A: the current: reference reappears', async () => {
    mockAmbientNodeId = 'page-a'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    const currentChip = () => screen.getByRole('button', { name: /^remove reference:/ })
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
    fireEvent.click(currentChip())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:/ })).not.toBeInTheDocument()
    )

    mockAmbientNodeId = 'page-b'
    rerender(tree())
    await waitFor(() => expect(currentChip()).toBeInTheDocument())

    mockAmbientNodeId = 'page-a'
    rerender(tree())
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
  })
})

describe('AITerminal — ask again keeps the hidden chip and references (KAN-341)', () => {
  it("regenerate's body carries the same openPageContext and references as the original send", async () => {
    mockAmbientNodeId = 'page-a'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    const currentChip = () => screen.getByRole('button', { name: /^remove reference:/ })
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
    fireEvent.click(currentChip())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:/ })).not.toBeInTheDocument()
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'what is on this page' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [sentMessage, sentOptions] = mockSendMessage.mock.calls[0]
    const sentBody = sentOptions.body as { openPageContext: boolean; references: unknown[] }
    expect(sentBody.openPageContext).toBe(false)

    // The seeded user message carries the real stamp `sendText` wrote
    // (`sentMessage.metadata`) — `handleAskAgain` reads the resend's
    // openPageContext/references off this, not off live state.
    mockMessages = [
      {
        id: 'm-ask',
        role: 'user',
        parts: [{ type: 'text', text: 'what is on this page' }],
        metadata: (sentMessage as { metadata: unknown }).metadata,
      },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'The page has...' }] },
    ]
    rerender(tree())

    const askAgain = await screen.findByRole('button', { name: 'ask again' })
    fireEvent.click(askAgain)

    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    const [regenerateOptions] = mockRegenerate.mock.calls[0]
    expect(regenerateOptions.body.openPageContext).toBe(sentBody.openPageContext)
    expect(regenerateOptions.body.references).toEqual(sentBody.references)
  })
})

describe('AITerminal — ask again ignores a chip reset since the original send (KAN-341)', () => {
  it('a hidden chip that reappeared after visiting another page and back stays hidden on regenerate', async () => {
    const user = userEvent.setup()
    mockAmbientNodeId = 'page-a'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    // × the chip on A, then ask.
    const currentChip = () => screen.getByRole('button', { name: /^remove reference:/ })
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
    await user.click(currentChip())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:/ })).not.toBeInTheDocument()
    )
    await user.type(screen.getByRole('textbox'), 'what is on this page')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [sentMessage] = mockSendMessage.mock.calls[0]

    mockMessages = [
      {
        id: 'm-ask',
        role: 'user',
        parts: [{ type: 'text', text: 'what is on this page' }],
        metadata: (sentMessage as { metadata: unknown }).metadata,
      },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'The page has...' }] },
    ]
    rerender(tree())

    // Open B, then back to A — the dismissal resets, so A's chip is back
    // and live `openPageContext` for A is now true again.
    mockAmbientNodeId = 'page-b'
    rerender(tree())
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
    mockAmbientNodeId = 'page-a'
    rerender(tree())
    await waitFor(() => expect(currentChip()).toBeInTheDocument())

    const askAgain = await screen.findByRole('button', { name: 'ask again' })
    await user.click(askAgain)

    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    const [regenerateOptions] = mockRegenerate.mock.calls[0]
    // The ORIGINAL send's choice (hidden), not the live, reset state (shown).
    expect(regenerateOptions.body.openPageContext).toBe(false)
    expect(regenerateOptions.body.nodeId).toBe('page-a')
    expect(regenerateOptions.body.threadId).toBe('conv-1')
  })
})

describe('AITerminal — ask again keeps a passage ×d since the original send (KAN-341)', () => {
  afterEach(() => clearSelection())

  it("a passage reference removed after asking still rides the regenerate body's references", async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <PassageBlockHost />
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitComposerReady()

    selectWord(screen.getByText('hello garden'), 'garden')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'what is this?')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [sentMessage] = mockSendMessage.mock.calls[0]
    const sentMetadata = (sentMessage as { metadata: { references: unknown[] } }).metadata
    expect(sentMetadata.references).toEqual(
      expect.arrayContaining([expect.objectContaining({ quotedText: 'garden' })])
    )

    mockMessages = [
      {
        id: 'm-ask',
        role: 'user',
        parts: [{ type: 'text', text: 'what is this?' }],
        metadata: sentMetadata,
      },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'It is a garden.' }] },
    ]
    rerender(tree())

    // × the passage chip — it drops from live `references`.
    const passageChip = await screen.findByRole('button', { name: /^remove reference:.*garden/ })
    await user.click(passageChip)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:.*garden/ })).not.toBeInTheDocument()
    )

    const askAgain = await screen.findByRole('button', { name: 'ask again' })
    await user.click(askAgain)

    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    const [regenerateOptions] = mockRegenerate.mock.calls[0]
    expect(regenerateOptions.body.references).toEqual(
      expect.arrayContaining([expect.objectContaining({ quotedText: 'garden' })])
    )
  })
})

describe('AITerminal — at the root, a kept chip is not double-sent as a whole-page ref (KAN-341)', () => {
  it("the sent metadata's wholePageRefPageIds is empty and the read row shows one chip, the home title", async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    // The current-page chip is kept (never ×'d) — the seeded `current:home-1`
    // reference still rides along as a whole-page ref alongside openPageContext.
    await user.type(screen.getByRole('textbox'), 'what is on this page')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [sentMessage] = mockSendMessage.mock.calls[0]
    const sentMetadata = (sentMessage as { metadata: { wholePageRefPageIds: string[] } }).metadata
    expect(sentMetadata.wholePageRefPageIds).toEqual([])

    mockMessages = [
      { id: 'm-ask', role: 'user', parts: [{ type: 'text', text: 'what is on this page' }], metadata: sentMetadata },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'The page has...' }] },
    ]
    rerender(tree())

    await waitFor(() => expect(screen.getAllByTestId('read-chip')).toHaveLength(1))
    expect(screen.getByTestId('read-chip')).toHaveTextContent('Life')
  })
})

describe('AITerminal — at the root, the current-page chip resolves off the home id (KAN-341)', () => {
  it('the chip labels the home title, × actually hides it, and a new thread reseeds it', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    const currentChip = () => screen.getByRole('button', { name: 'remove reference: Life' })
    await waitFor(() => expect(currentChip()).toBeInTheDocument())

    await user.click(currentChip())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:/ })).not.toBeInTheDocument()
    )

    await user.type(screen.getByRole('textbox'), 'what is on this page')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, sentOptions] = mockSendMessage.mock.calls[0]
    expect((sentOptions.body as { openPageContext: boolean }).openPageContext).toBe(false)

    // `ThreadHead`'s "new thread" button only draws once there's more than
    // one turn (`groupTurns`) — two asks give it a head to hold.
    mockMessages = [
      { id: 'm-ask-1', role: 'user', parts: [{ type: 'text', text: 'what is on this page' }] },
      { id: 'm-answer-1', role: 'assistant', parts: [{ type: 'text', text: 'The page has...' }] },
      { id: 'm-ask-2', role: 'user', parts: [{ type: 'text', text: 'anything else' }] },
      { id: 'm-answer-2', role: 'assistant', parts: [{ type: 'text', text: 'Nothing else.' }] },
    ]
    rerender(tree())

    await user.click(screen.getByRole('button', { name: 'new thread' }))
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
  })
})

describe('AITerminal — at the root, a diff card against the home page is not "missing" (KAN-341)', () => {
  // Both cases must stamp { nodeId: 'home-1', nodeName: 'Life' }: with no
  // targetPageId the stamp falls back to the open page; with targetPageId set
  // to the home id itself, resolveStampTarget must not read the (home-less)
  // `allPages` miss as a deleted/hallucinated target.
  it.each([
    ['no targetPageId', undefined],
    ['targetPageId = the home id', 'home-1'],
  ])('%s stamps the home page and accept is not withheld', async (_label, targetPageId) => {
    mockMessages = [
      { id: 'm-ask', role: 'user', parts: [{ type: 'text', text: 'add a line' }] },
      {
        id: 'm-answer',
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_changes',
            toolCallId: 'tc-root-target',
            state: 'input-available',
            input: {
              ...(targetPageId ? { targetPageId } : {}),
              changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'hello' } }],
            },
          },
        ],
      },
    ]
    renderTerminal()
    await waitReady()

    const card = await screen.findByRole('group', { name: 'proposed edit' })
    // Not missing, not needing a place — the header names the home page.
    await waitFor(() => expect(within(card).getByText(/— Life/)).toBeInTheDocument())
    expect(within(card).queryByText(/target page not found/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/these changes need a place/)).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'accept' })).toBeEnabled()

    fireEvent.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockWriteAcceptedChanges).toHaveBeenCalledTimes(1))
    const [call] = mockWriteAcceptedChanges.mock.calls[0]
    expect(resolveAcceptTarget(call.resolutions, call.toolCallId, call.openNodeId)).toBe('home-1')
  })
})

describe('AITerminal — ask again on a stale page stamps the regenerated card to the question\'s own page, not the live one (KAN-341)', () => {
  it('a propose_changes part with no targetPageId on the regenerated answer is stamped to A, so accept resolves to A, not B', async () => {
    const user = userEvent.setup()
    mockListPages.mockResolvedValue([
      { id: 'page-a', parentId: null, type: 'page', title: 'Garden', blocks: [], order: 0, props: {} },
      { id: 'page-b', parentId: null, type: 'page', title: 'Kitchen', blocks: [], order: 1, props: {} },
    ])
    mockAmbientNodeId = 'page-a'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    await user.type(screen.getByRole('textbox'), 'tidy this page')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [sentMessage] = mockSendMessage.mock.calls[0]

    mockMessages = [
      {
        id: 'm-ask',
        role: 'user',
        parts: [{ type: 'text', text: 'tidy this page' }],
        metadata: (sentMessage as { metadata: unknown }).metadata,
      },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'Tidied.' }] },
    ]
    rerender(tree())

    // Navigate to B, THEN ask again — the resend still reads A's own stamp.
    mockAmbientNodeId = 'page-b'
    rerender(tree())
    const askAgain = await screen.findByRole('button', { name: 'ask again' })
    await user.click(askAgain)
    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    const [regenerateOptions] = mockRegenerate.mock.calls[0]
    expect(regenerateOptions.body.nodeId).toBe('page-a')

    // The regenerated answer's own card: the model read A's blocks and never
    // names a target page.
    mockMessages = [
      ...mockMessages,
      {
        id: 'm-answer-2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_changes',
            toolCallId: 'tc-ask-again',
            state: 'input-available',
            input: {
              changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'tidy' } }],
            },
          },
        ],
      },
    ]
    rerender(tree())

    const card = await screen.findByRole('group', { name: 'proposed edit' })
    await waitFor(() => expect(within(card).getByText(/— Garden/)).toBeInTheDocument())

    fireEvent.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockWriteAcceptedChanges).toHaveBeenCalledTimes(1))
    const [call] = mockWriteAcceptedChanges.mock.calls[0]
    expect(resolveAcceptTarget(call.resolutions, call.toolCallId, call.openNodeId)).toBe('page-a')
  })
})

describe('AITerminal — the regenerated answer\'s read row leads with the question\'s own page, not the live one (KAN-341)', () => {
  it('ask again from B on a question asked on A shows A as the lead read chip', async () => {
    const user = userEvent.setup()
    mockListPages.mockResolvedValue([
      { id: 'page-a', parentId: null, type: 'page', title: 'Garden', blocks: [], order: 0, props: {} },
      { id: 'page-b', parentId: null, type: 'page', title: 'Kitchen', blocks: [], order: 1, props: {} },
    ])
    mockAmbientNodeId = 'page-a'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    await user.type(screen.getByRole('textbox'), 'what is on this page')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [sentMessage] = mockSendMessage.mock.calls[0]

    mockMessages = [
      {
        id: 'm-ask',
        role: 'user',
        parts: [{ type: 'text', text: 'what is on this page' }],
        metadata: (sentMessage as { metadata: unknown }).metadata,
      },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'The page has...' }] },
    ]
    rerender(tree())

    mockAmbientNodeId = 'page-b'
    rerender(tree())
    const askAgain = await screen.findByRole('button', { name: 'ask again' })
    await user.click(askAgain)
    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))

    // "ask again" replaces the old answer in place — only the regenerated one
    // remains, with no `read` stamp yet (that write goes through
    // `setMessages`, which a reload/first paint hasn't caught up to).
    mockMessages = [
      mockMessages[0],
      { id: 'm-answer-2', role: 'assistant', parts: [{ type: 'text', text: 'It has a bench.' }] },
    ]
    rerender(tree())

    await screen.findByText('It has a bench.')
    expect(screen.getAllByTestId('read-chip')[0]).toHaveTextContent('Garden')
  })
})

describe('AITerminal — at the root, accepting a linked configure_view card uses the home id (KAN-341)', () => {
  it('accept calls configureViewFromProposal with pageId = the home id, not stuck on a null host', async () => {
    mockMessages = [
      { id: 'm-ask', role: 'user', parts: [{ type: 'text', text: 'show the tasks as a board' }] },
      {
        id: 'm-answer',
        role: 'assistant',
        parts: [
          {
            type: 'tool-configure_view',
            toolCallId: 'tc-root-view',
            state: 'input-available',
            input: {
              pageId: 'collection-1',
              mode: 'board',
              targetCollection: 'Tasks',
              reason: 'A board of the tasks collection',
            },
          },
        ],
      },
    ]
    renderTerminal()
    await waitReady()

    const card = await screen.findByRole('group', { name: 'Proposed view' })
    fireEvent.click(within(card).getByRole('button', { name: 'Apply view' }))

    await waitFor(() => expect(mockConfigureViewFromProposal).toHaveBeenCalledTimes(1))
    const [, proposal] = mockConfigureViewFromProposal.mock.calls[0]
    expect(proposal.pageId).toBe('home-1')
  })
})

describe('AITerminal — the path, end to end (KAN-341, PATH_STEPS 1-5)', () => {
  it('root sends the home id; a hidden chip returns after a visit elsewhere; ask again keeps it hidden', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()

    // 1 & 3. At the root (no ?nodeId=) the send body carries the home row's
    // own id, not null.
    const textbox = screen.getByRole('textbox')
    await user.type(textbox, 'what is on this page')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.objectContaining({ nodeId: 'home-1' }) })
    )

    // 4. Open page A, × its chip, visit B, then return to A — the chip
    // comes back.
    mockAmbientNodeId = 'page-a'
    rerender(tree())
    const currentChip = () => screen.getByRole('button', { name: /^remove reference:/ })
    await waitFor(() => expect(currentChip()).toBeInTheDocument())
    await user.click(currentChip())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:/ })).not.toBeInTheDocument()
    )

    mockAmbientNodeId = 'page-b'
    rerender(tree())
    await waitFor(() => expect(currentChip()).toBeInTheDocument())

    mockAmbientNodeId = 'page-a'
    rerender(tree())
    await waitFor(() => expect(currentChip()).toBeInTheDocument())

    // 5. On A, × the chip, ask, then "ask again" — the regenerate body keeps
    // openPageContext: false and the same references as the original send.
    await user.click(currentChip())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove reference:/ })).not.toBeInTheDocument()
    )

    mockSendMessage.mockClear()
    await user.type(screen.getByRole('textbox'), 'what is on this page')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, sentOptions] = mockSendMessage.mock.calls[0]
    const sentBody = sentOptions.body as { openPageContext: boolean; references: unknown[] }
    expect(sentBody.openPageContext).toBe(false)

    mockMessages = [
      { id: 'm-ask', role: 'user', parts: [{ type: 'text', text: 'what is on this page' }] },
      { id: 'm-answer', role: 'assistant', parts: [{ type: 'text', text: 'The page has...' }] },
    ]
    rerender(tree())

    const askAgain = await screen.findByRole('button', { name: 'ask again' })
    await user.click(askAgain)

    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    const [regenerateOptions] = mockRegenerate.mock.calls[0]
    expect(regenerateOptions.body.openPageContext).toBe(sentBody.openPageContext)
    expect(regenerateOptions.body.references).toEqual(sentBody.references)
  })
})

describe('AITerminal — ask-from-selection at the root uses the home id (KAN-341)', () => {
  afterEach(() => clearSelection())

  it('appends a passage reference stamped with the home id, not null', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <PassageBlockHost />
        <AITerminal />
      </QueryClientProvider>
    )
    await waitComposerReady()

    selectWord(screen.getByText('hello garden'), 'garden')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))

    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'what is this?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    expect(body.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: 'home-1',
          blockId: 'home-block-1',
          quotedText: 'garden',
        }),
      ])
    )
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

describe('closing the composer leaves only the tab; reopening restores the same thread (KAN-366)', () => {
  function renderInShell() {
    const shell = document.createElement('div')
    shell.setAttribute('data-part', 'shell')
    document.body.appendChild(shell)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const utils = render(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>,
      { container: shell }
    )
    return { ...utils, shell }
  }

  it('⌘J collapses the card into the clip layer behind the live tab; ⌘J again brings back the same turns', async () => {
    // jsdom lays out nothing — stand in for the tab's real 30px (h-[30px]) so
    // the published clearance below is the tab's own footprint, not 0.
    const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30)
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is the capital of France' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Paris is the capital of France' }],
      },
    ]
    const { shell } = renderInShell()
    await waitReady()

    expect(screen.getByText('Paris is the capital of France')).toBeInTheDocument()
    const card = document.querySelector('[data-part="composer-card"]') as HTMLElement
    expect(card).not.toHaveAttribute('data-collapsed')
    expect(card).not.toHaveAttribute('inert')

    act(() => requestComposerToggle())

    expect(card).toHaveAttribute('data-collapsed')
    expect(card).toHaveAttribute('inert')
    // The clip layer is the shared parent `TerminalDrawer` wraps both the tab
    // and the card in — not a prop on either, so read it off the DOM.
    expect(card.parentElement).toHaveClass('overflow-clip')
    const tab = screen.getByRole('button', { name: 'Open composer' })
    const tabSection = tab.closest('section') as HTMLElement
    expect(tabSection.parentElement).toBe(card.parentElement)
    expect(tabSection.className).toContain('pointer-events-auto')
    expect(card.className).toContain('pointer-events-none')
    expect(shell.style.getPropertyValue(COMPOSER_CLEARANCE_VAR)).toBe('30px')

    act(() => requestComposerToggle())

    expect(card).not.toHaveAttribute('data-collapsed')
    expect(card).not.toHaveAttribute('inert')
    expect(screen.getByText('what is the capital of France')).toBeInTheDocument()
    expect(screen.getByText('Paris is the capital of France')).toBeInTheDocument()

    height.mockRestore()
  })
})

describe('AITerminal — the research pill resets after one question, and the send carries it (KAN-182)', () => {
  it('arms research for one send, stamps it on the sent message, then is unarmed again for the next', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    const pill = screen.getByRole('button', { name: 'research' })
    await user.click(pill)
    const menu = await screen.findByRole('menu', { name: 'mode menu' })
    await user.click(within(menu).getByText('deep research'))

    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, 'what changed in the market today')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const firstMessage = mockSendMessage.mock.calls[0][0]
    expect((firstMessage.metadata as { research?: boolean }).research).toBe(true)

    // The pill is back at rest for the next question (existing behaviour):
    // reopening the menu shows `ask` selected again, not `deep research`.
    await user.click(pill)
    const resetMenu = await screen.findByRole('menu', { name: 'mode menu' })
    const [askRow] = within(resetMenu).getAllByRole('menuitem')
    expect(askRow.className).toContain('bg-mn-text/[0.07]')
    await user.keyboard('{Escape}')

    await user.type(textbox, 'and the next question')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2))
    const secondMessage = mockSendMessage.mock.calls[1][0]
    expect((secondMessage.metadata as { research?: boolean }).research).toBe(false)
  })
})

describe('AITerminal — the palette’s deep research row arms research (KAN-182)', () => {
  it('a focus request carrying research: true arms the pill, open or closed composer alike', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitReady()

    act(() => requestTerminalFocus(undefined, { research: true }))

    const pill = screen.getByRole('button', { name: 'research' })
    await waitFor(() => expect(pill.className).toContain('bg-mn-text'))
    expect(pill.className).toContain('text-raw-paper')

    await user.click(pill)
    const menu = await screen.findByRole('menu', { name: 'mode menu' })
    const [, deepResearchRow] = within(menu).getAllByRole('menuitem')
    expect(deepResearchRow.className).toContain('bg-mn-text/[0.07]')
  })
})

describe('AITerminal — the off-again note under a deep-research answer\'s read chips (KAN-182, 6r f8)', () => {
  const OFF_AGAIN_NOTE = 'deep research is off again. this answer read only your pond.'

  it('shows the note once, on the first answer after a deep-research answer', async () => {
    mockMessages = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'what changed in the market' }],
        metadata: { research: true },
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'a deep research answer' }],
      },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'and this one' }],
        metadata: { research: false },
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'off again' }],
      },
    ]
    renderTerminal()
    await waitReady()

    expect(screen.getAllByText(OFF_AGAIN_NOTE)).toHaveLength(1)
  })

  it('does not show the note on the answer after that one', async () => {
    mockMessages = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'what changed in the market' }],
        metadata: { research: true },
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'a deep research answer' }],
      },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'and this one' }],
        metadata: { research: false },
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'off again' }],
      },
      {
        id: 'u3',
        role: 'user',
        parts: [{ type: 'text', text: 'a third question' }],
        metadata: { research: false },
      },
      {
        id: 'a3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'ordinary answer' }],
      },
    ]
    renderTerminal()
    await waitReady()

    expect(screen.queryByText(OFF_AGAIN_NOTE)).not.toBeInTheDocument()
  })

  it('a message seeded with the stamp already set (a reload) still shows the note without re-deriving from live state', async () => {
    mockMessages = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'one question' }],
        metadata: { research: false },
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'an answer' }],
        // Fewer than two prior user turns — live derivation would say
        // false. The explicit stamp from a prior session wins anyway.
        metadata: { researchEnded: true },
      },
    ]
    renderTerminal()
    await waitReady()

    expect(screen.getByText(OFF_AGAIN_NOTE)).toBeInTheDocument()
  })
})

describe('AITerminal — the path, end to end (KAN-182, PATH_STEPS 1-6)', () => {
  const OFF_AGAIN_NOTE = 'deep research is off again. this answer read only your pond.'

  it('⌘J, pill, menu, arrow+enter, reopen+Esc stays armed, send resets, second send notes off-again once', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    await waitReady()

    // 1. ⌘J (`requestComposerToggle`, the same event the real shortcut fires
    // — see the KAN-323 tests above) opens the composer with the line
    // focused; the pill sits at rest. The composer starts open by default,
    // so close it first to make the open-with-⌘J step observable.
    act(() => requestComposerToggle())
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    act(() => requestComposerToggle())
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toHaveFocus())

    const pill = screen.getByRole('button', { name: 'research' })
    expect(pill.className).not.toContain('bg-mn-text')

    // 2. Clicking the pill opens the two-row mode menu.
    await user.click(pill)
    const menu = await screen.findByRole('menu', { name: 'mode menu' })
    const [askRow, deepResearchRow] = within(menu).getAllByRole('menuitem')
    expect(askRow.textContent).toBe('askreads this pond. quick.')
    expect(deepResearchRow.textContent).toBe(
      'deep researchreads the web and this pond. slow and thorough: primary sources, every claim checked against independent ones.'
    )
    expect(askRow.className).toContain('bg-mn-text/[0.07]')

    // 3. ↓↓ then ↵ moves the highlight off `ask` (click-open starts there)
    // onto `deep research` and picks it; the menu closes, focus returns to
    // the line, the pill arms.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
    await waitFor(() => expect(textbox).toHaveFocus())
    await waitFor(() => expect(pill.className).toContain('bg-mn-text'))
    expect(pill.className).toContain('text-raw-paper')

    // 4. Reopening the menu and pressing Esc leaves the mode unchanged
    // (still armed) and returns focus to the line.
    await user.click(pill)
    const reopenedMenu = await screen.findByRole('menu', { name: 'mode menu' })
    const [, reopenedDeepResearchRow] = within(reopenedMenu).getAllByRole('menuitem')
    expect(reopenedDeepResearchRow.className).toContain('bg-mn-text/[0.07]')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(textbox).toHaveFocus())
    expect(pill.className).toContain('bg-mn-text')
    expect(pill.className).toContain('text-raw-paper')

    // 5. Send — the question goes out with `research: true` on its
    // metadata, and the pill is back at rest for the next question.
    await user.type(textbox, 'what changed in the market today')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect((mockSendMessage.mock.calls[0][0].metadata as { research?: boolean }).research).toBe(
      true
    )
    await waitFor(() => expect(pill.className).not.toContain('bg-mn-text'))

    // 6. A second send after a deep-research answer shows the off-again
    // note once; a third send does not add a second one. `AITerminal`
    // reads `research`/`researchEnded` off `useChat`'s own `messages`, not
    // off what `sendMessage` was called with, so seed the mocked thread to
    // the state the two real sends above would have produced.
    mockMessages = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'what changed in the market today' }],
        metadata: { research: true },
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'a deep research answer' }],
      },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'and the next question' }],
        metadata: { research: false },
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'off again' }],
      },
    ]
    rerender(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getAllByText(OFF_AGAIN_NOTE)).toHaveLength(1))

    mockMessages = [
      ...mockMessages,
      {
        id: 'u3',
        role: 'user',
        parts: [{ type: 'text', text: 'a third question' }],
        metadata: { research: false },
      },
      {
        id: 'a3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'ordinary answer' }],
      },
    ]
    rerender(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.queryByText(OFF_AGAIN_NOTE)).not.toBeInTheDocument())
  })
})

describe('the thread head names the CURRENT page\'s area, not where the thread began (KAN-331)', () => {
  // A top-level page X (its own area) and a top-level page Y with a child
  // under it (Y's area is Y, the topmost ancestor) — `areaOf`'s walk per
  // `crumbs.ts`.
  const pageX = {
    id: 'page-x',
    parentId: null,
    type: 'page' as const,
    title: 'Money',
    blocks: [],
    order: 0,
    props: {},
  }
  const pageY = {
    id: 'page-y',
    parentId: null,
    type: 'page' as const,
    title: 'Creativity',
    blocks: [],
    order: 0,
    props: {},
  }
  const pageYChild = {
    id: 'page-y-child',
    parentId: 'page-y',
    type: 'page' as const,
    title: 'Kitchen renovation',
    blocks: [],
    order: 1,
    props: {},
  }
  const twoTurns = [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'question 1' }] },
    { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'answer 1' }] },
    { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'question 2' }] },
    { id: 'm4', role: 'assistant', parts: [{ type: 'text', text: 'answer 2' }] },
  ]

  it('reads X\'s own title on X, then Y\'s title after navigating to Y\'s child', async () => {
    mockListPages.mockResolvedValue([pageX, pageY, pageYChild])
    mockAmbientNodeId = pageX.id
    mockMessages = twoTurns
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    await waitReady()
    await waitFor(() => expect(mockListPages).toHaveBeenCalled())

    await waitFor(() =>
      expect(document.querySelector('[data-part="thread-area"]')).toHaveTextContent(
        `thread · ${pageX.title}`
      )
    )

    mockAmbientNodeId = pageYChild.id
    rerender(tree())

    await waitFor(() =>
      expect(document.querySelector('[data-part="thread-area"]')).toHaveTextContent(
        `thread · ${pageY.title}`
      )
    )
  })
})
