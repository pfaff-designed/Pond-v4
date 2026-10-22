/**
 * KAN-284 Done-when #1 — proves the client already renders the normal case
 * correctly over a thread of the Life 2 shape: the REAL `AITerminal` with the
 * REAL (unmocked) `@ai-sdk/react` `useChat`, seeded with the synthetic
 * same-shape thread (`buildUnresolvedToolThreadFixture`), sends a plain question and
 * resolves `global.fetch` with `captured-stream.txt`'s exact SSE body — the
 * answer must render under the question and the next Supabase `conversations`
 * `update` must carry it.
 *
 * jsdom (this suite's `testEnvironment`) has no `fetch`/`ReadableStream`/
 * `TransformStream`/`TextDecoderStream`/`TextDecoder` — `ai`'s
 * `HttpChatTransport` and `eventsource-parser` need all five, the latter at
 * MODULE-LOAD time (`class EventSourceParserStream extends TransformStream`),
 * so they are polyfilled from Node's own `node:util` + `node:stream/web`
 * before anything reaches `@ai-sdk/react`/`ai`. Everything downstream of that
 * chain — `AITerminal` included — is loaded with `require()`, never `import`:
 * Babel's CommonJS transform hoists `import`s above ordinary statements, so an
 * `import` here would run before the polyfill assignments land.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder } = require('node:util')
const polyfillGlobal = globalThis as Record<string, unknown>
polyfillGlobal.TextDecoder = NodeTextDecoder
polyfillGlobal.TextEncoder = NodeTextEncoder
const nodeStreamWeb = require('node:stream/web')
polyfillGlobal.ReadableStream = nodeStreamWeb.ReadableStream
polyfillGlobal.TransformStream = nodeStreamWeb.TransformStream
polyfillGlobal.TextDecoderStream = nodeStreamWeb.TextDecoderStream
polyfillGlobal.TextEncoderStream = nodeStreamWeb.TextEncoderStream

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { emptyResolutions } from '@/lib/conversation/resolutions'
import { buildUnresolvedToolThreadFixture } from './helpers/unresolved-tool-thread'
import type { UIMessage } from 'ai'

// ── next/navigation, pond context — no page open, Life 2's own pond ────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: 'pond-life-2', name: 'Life 2' }, ponds: [], loading: false }),
  usePondId: () => 'pond-life-2',
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life 2' }))

// ── Supabase: auth.getUser() + the one `conversations` row ─────────────────
// Same chain shape as `ask-again-path.test.tsx`: seeded with the fixture
// thread up front, `update` captures each save so the test can assert on it.

let mockStoredTranscript: unknown = {
  messages: buildUnresolvedToolThreadFixture(),
  resolutions: emptyResolutions(),
}
const mockSupabaseUpdate = jest.fn((payload: { transcript: unknown }) => {
  mockStoredTranscript = JSON.parse(JSON.stringify(payload.transcript))
  return { eq: async () => ({ error: null }) }
})

jest.mock('@/lib/supabase/client', () => {
  const chain = () => {
    const q: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'order', 'limit']) q[method] = () => q
    q.maybeSingle = async () => ({
      data: { id: 'conv-1', transcript: mockStoredTranscript },
      error: null,
    })
    return q
  }
  return {
    createClient: () => ({
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
      },
      from: (table: string) => {
        if (table !== 'conversations') return chain()
        return { ...chain(), update: mockSupabaseUpdate }
      },
    }),
  }
})

// ── Pages, change log, deletion — the rest of AITerminal's boundary ────────

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  collectionTitleResolver: () => () => undefined,
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: jest.fn().mockResolvedValue([]),
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  resolveChainStatuses: jest.fn().mockResolvedValue(new Map()),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn(),
  markOutdated: jest.fn(),
  listRecords: jest.fn().mockResolvedValue([]),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

// ── The chat stream itself ──────────────────────────────────────────────────
// `captured-stream.txt`'s exact bytes (the orchestrator's real capture for
// this thread's shape; answer text was already neutral in the capture).

const CAPTURED_STREAM = `data: {"type":"start"}

data: {"type":"start-step"}

data: {"type":"text-start","id":"0"}

data: {"type":"text-delta","id":"0","delta":"Creative"}

data: {"type":"text-delta","id":"0","delta":","}

data: {"type":"text-delta","id":"0","delta":" Personal"}

data: {"type":"text-delta","id":"0","delta":", Professional"}

data: {"type":"text-delta","id":"0","delta":" —"}

data: {"type":"text-delta","id":"0","delta":" and"}

data: {"type":"text-delta","id":"0","delta":" the databases"}

data: {"type":"text-delta","id":"0","delta":"/"}

data: {"type":"text-delta","id":"0","delta":"Life"}

data: {"type":"text-delta","id":"0","delta":" pages"}

data: {"type":"text-delta","id":"0","delta":" which"}

data: {"type":"text-delta","id":"0","delta":" look"}

data: {"type":"text-delta","id":"0","delta":" more"}

data: {"type":"text-delta","id":"0","delta":" like system"}

data: {"type":"text-delta","id":"0","delta":" pages"}

data: {"type":"text-delta","id":"0","delta":" than"}

data: {"type":"text-delta","id":"0","delta":" areas"}

data: {"type":"text-delta","id":"0","delta":"."}

data: {"type":"text-end","id":"0"}

data: {"type":"finish-step"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]
`

const ANSWER_TEXT =
  'Creative, Personal, Professional — and the databases/Life pages which look more like system pages than areas.'

// Same framing as `CAPTURED_STREAM` minus every `text-delta` chunk: `text-start`/
// `text-end` stay (the SDK's own `write()` on `text-start` is what pushes the
// assistant message into `messages` at all), so the result is a real assistant
// message holding one empty `text` part — a turn that reaches `finish` with
// nothing to show and no `error`, today's blank-with-no-error case.
const BLANK_STREAM = `data: {"type":"start"}

data: {"type":"start-step"}

data: {"type":"text-start","id":"0"}

data: {"type":"text-end","id":"0"}

data: {"type":"finish-step"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]
`

// The stream-level `error` chunk Done-when also names (useChat's own `error`
// path, not `BLANK_STREAM`'s "finished with nothing" one): the SDK's
// `processUIMessageStream` turns this into `onError(new Error(errorText))`,
// which `useChat` surfaces as `error` — the same `error && !isStreaming`
// branch `AnswerError` already covers.
const ERROR_STREAM = `data: {"type":"start"}

data: {"type":"start-step"}

data: {"type":"error","errorText":"the model is unavailable"}

data: [DONE]
`

function sseBodyStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new (polyfillGlobal.ReadableStream as typeof ReadableStream)({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// The bodies successive `/api/chat` calls resolve with, in order — the normal
// and blank-answer cases below each queue one; the path test queues the error
// stream then the captured one, so `ask again`'s regenerate() gets a real
// answer. Once drained, the last one keeps repeating.
let chatStreamQueue: string[] = [CAPTURED_STREAM]
let lastChatStreamBody = CAPTURED_STREAM

const mockFetch = jest.fn((input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString()
  if (url.includes('/api/chat')) {
    lastChatStreamBody = chatStreamQueue.length > 0 ? chatStreamQueue.shift()! : lastChatStreamBody
    return Promise.resolve({
      ok: true,
      body: sseBodyStream(lastChatStreamBody),
      text: async () => '',
    })
  }
  return Promise.resolve({ ok: true, json: async () => ({ extractions: [] }) })
})
polyfillGlobal.fetch = mockFetch

// `AITerminal` transitively requires `@ai-sdk/react` → `ai` → `eventsource-parser`,
// which needs the polyfills above already installed — `require`d here, after them,
// never `import`ed (see the file header).
const { AITerminal } = require('@/components/organisms/AITerminal')
const { openComposerIfClosed } = require('./helpers/open-composer')

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

const waitUntilReady = () => {
  openComposerIfClosed()
  return waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

beforeEach(() => {
  mockFetch.mockClear()
  mockSupabaseUpdate.mockClear()
  mockStoredTranscript = {
    messages: buildUnresolvedToolThreadFixture(),
    resolutions: emptyResolutions(),
  }
  chatStreamQueue = [CAPTURED_STREAM]
  lastChatStreamBody = CAPTURED_STREAM
})

describe('KAN-284 — the normal case over a Life-2-shaped thread (Done-when #1)', () => {
  it('a plain question answers under it, and the saved transcript carries the new assistant message', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'which areas does this pond have? one line, no changes{Enter}'
    )

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.anything()
      )
    )

    expect(await screen.findByText(ANSWER_TEXT)).toBeInTheDocument()

    await waitFor(() => {
      const saved = mockStoredTranscript as {
        messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
      }
      const last = saved.messages[saved.messages.length - 1]
      expect(last.role).toBe('assistant')
      expect(last.parts.some((p) => p.type === 'text' && p.text === ANSWER_TEXT)).toBe(true)
    })
  })
})

describe('KAN-284 — a stream that finishes with nothing to show gets the error row, never a blank answer', () => {
  it("shows the error row with ask again, and never saves the blank message as the transcript's last entry", async () => {
    chatStreamQueue = [BLANK_STREAM]
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'which areas does this pond have? one line, no changes{Enter}'
    )

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.anything()
      )
    )

    const errorRow = await screen.findByRole('alert')
    expect(errorRow).toHaveTextContent('nothing was kept')
    expect(within(errorRow).getByRole('button', { name: 'ask again' })).toBeInTheDocument()

    // The blank answer that triggered the row above must never be the transcript's
    // saved last entry — a reload must never show (or `ask again` resend) it. The
    // save effect filters it out of what's saved rather than skipping the save, so
    // the last saved transcript is the 42-message fixture plus the new question,
    // with no trailing assistant turn at all.
    await waitFor(() => expect(mockSupabaseUpdate).toHaveBeenCalled())
    const [lastPayload] = mockSupabaseUpdate.mock.calls[mockSupabaseUpdate.mock.calls.length - 1]
    const saved = (lastPayload as { transcript: { messages: UIMessage[] } }).transcript
    expect(saved.messages).toHaveLength(43)
    expect(saved.messages[41]).toMatchObject(buildUnresolvedToolThreadFixture()[41])
    expect(saved.messages[42]).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'which areas does this pond have? one line, no changes' }],
    })
  })
})

describe('KAN-284 — ask again on a real answer whose replacement finishes blank', () => {
  it('keeps the old answer shown and saved, with the error row trailing it', async () => {
    chatStreamQueue = [CAPTURED_STREAM, BLANK_STREAM]
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'which areas does this pond have? one line, no changes{Enter}'
    )

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.anything()
      )
    )
    expect(await screen.findByText(ANSWER_TEXT)).toBeInTheDocument()

    const askAgainButton = screen.getByRole('button', { name: 'ask again' })
    await user.click(askAgainButton)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    // The replacement finished blank: the old answer must still be on screen —
    // not folded, unreadable, under a blank message — and the error row trails it.
    const errorRow = await screen.findByRole('alert')
    expect(errorRow).toHaveTextContent('nothing was kept')
    expect(screen.getByText(ANSWER_TEXT)).toBeInTheDocument()

    await waitFor(() => {
      const [lastPayload] = mockSupabaseUpdate.mock.calls[mockSupabaseUpdate.mock.calls.length - 1]
      const saved = (lastPayload as { transcript: { messages: UIMessage[] } }).transcript
      const last = saved.messages[saved.messages.length - 1]
      expect(last.role).toBe('assistant')
      expect(
        (last.parts as Array<{ type: string; text?: string }>).some(
          (p) => p.type === 'text' && p.text === ANSWER_TEXT
        )
      ).toBe(true)
    })
  })
})

describe('KAN-324 — ask again on a real answer whose replacement errors shows exactly one control set', () => {
  it('restores the real answer with the error row trailing it, and draws the window controls once', async () => {
    // A genuinely one-turn thread (no fixture history): `turns.length <= 1`'s
    // gate is what let this double through.
    mockStoredTranscript = { messages: [], resolutions: emptyResolutions() }
    chatStreamQueue = [CAPTURED_STREAM, ERROR_STREAM]
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'which areas does this pond have? one line, no changes{Enter}'
    )

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.anything()
      )
    )
    expect(await screen.findByText(ANSWER_TEXT)).toBeInTheDocument()

    const askAgainButton = screen.getByRole('button', { name: 'ask again' })
    await user.click(askAgainButton)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    // The resend errored outright: the real answer it was replacing is restored
    // verbatim, with the error row trailing it — same shape as a blank finish,
    // just via useChat's own `error` path instead.
    const errorRow = await screen.findByRole('alert')
    expect(errorRow).toHaveTextContent('nothing was kept')
    expect(screen.getByText(ANSWER_TEXT)).toBeInTheDocument()

    // The restored answer still has real content, so its own row's gate (`text
    // || isStreaming`) holds too — exactly one window-control set must draw,
    // not one from that row AND one from the error row below it.
    expect(document.querySelectorAll('[data-part="composer-window-controls"]')).toHaveLength(1)
  })
})

describe('KAN-284 — PATH_STEPS end to end: a failed turn shows the error row, and ask again gets a real answer', () => {
  it('drives the real composer through an error chunk, ask again, and the saved answer', async () => {
    chatStreamQueue = [ERROR_STREAM, CAPTURED_STREAM]
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'which areas does this pond have? one line, no changes{Enter}'
    )

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.anything()
      )
    )

    // useChat's own `error` path (the stream-level `error` chunk, not a blank
    // finish) — already covered by the `error && !isStreaming` branch `AnswerError`
    // renders from; this proves it still holds on the real composer.
    const errorRow = await screen.findByRole('alert')
    const askAgainButton = within(errorRow).getByRole('button', { name: 'ask again' })

    await user.click(askAgainButton)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    expect(await screen.findByText(ANSWER_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await waitFor(() => {
      const saved = mockStoredTranscript as {
        messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
      }
      const last = saved.messages[saved.messages.length - 1]
      expect(last.role).toBe('assistant')
      expect(last.parts.some((p) => p.type === 'text' && p.text === ANSWER_TEXT)).toBe(true)
    })
  })
})
