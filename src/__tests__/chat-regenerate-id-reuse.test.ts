/**
 * @jest-environment node
 *
 * KAN-315 — pins the live-generation reuse path through the REAL `@ai-sdk/react`
 * `Chat` class (not the hand-rolled mock `ask-again-path.test.tsx` uses, which
 * hand-assigns a unique id to every streamed answer and so cannot see the SDK's
 * own id assignment). Only the network boundary (`transport.sendMessages`) is
 * faked, emitting the same shape the server actually sends: `toUIMessageStreamResponse`
 * is called with no `generateMessageId` (chat/route.ts), so every `start` chunk
 * carries no `messageId` — the client's own id assignment is the only thing that
 * can land two answers on the same id. `sendMessages` returns the already-parsed
 * `ReadableStream<UIMessageChunk>` (the SSE framing is a `DefaultChatTransport`
 * concern, done before the stream reaches `Chat`), so the fake enqueues chunk
 * objects directly rather than SSE bytes.
 */
import { Chat } from '@ai-sdk/react'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

const chunkStream = (chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift()
      if (!chunk) {
        controller.close()
        return
      }
      controller.enqueue(chunk)
    },
  })

// Mirrors the server stream shape exactly: no `messageId` on `start`, since
// route.ts's `toUIMessageStreamResponse({ sendSources: true })` configures no
// `generateMessageId`.
const answerChunks = (text: string): UIMessageChunk[] => [
  { type: 'start' },
  { type: 'start-step' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
  { type: 'finish-step' },
  { type: 'finish' },
]

const fakeTransport = (answers: string[]): ChatTransport<UIMessage> => {
  let call = 0
  return {
    sendMessages: async () => chunkStream(answerChunks(answers[call++])),
    reconnectToStream: async () => null,
  }
}

const assistantIds = (chat: Chat<UIMessage>) =>
  chat.messages.filter((m) => m.role === 'assistant').map((m) => m.id)

// A stream the test drives chunk-by-chunk, so two concurrent `regenerate()` calls'
// streams can be interleaved deliberately instead of resolving in one go.
const controlledStream = () => {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>
  const stream = new ReadableStream<UIMessageChunk>({
    start: (c) => {
      controller = c
    },
  })
  return {
    stream,
    push: (chunk: UIMessageChunk) => controller.enqueue(chunk),
    end: () => controller.close(),
  }
}

describe('@ai-sdk/react Chat — characterization (KAN-315)', () => {
  // Characterizes third-party behavior, not Pond code: no `AITerminal.tsx` is
  // involved. This is the reason `dispatchGate` must stop overlapping
  // `regenerate()`/`sendMessage()` calls rather than rely on the SDK to keep
  // their ids distinct — if a future `@ai-sdk/react` serializes overlapping
  // calls itself, this assertion goes red; that would mean the SDK fixed the
  // race upstream, not that Pond regressed, so update or delete the test
  // rather than treat it as a Pond failure.
  it('characterizes the SDK: two overlapping regenerate() calls can cross answers and reuse an id', async () => {
    // Mirrors `handleAskAgain`: a pending `flushPendingPageSave` can defer BOTH
    // clicks' `regenerate()` onto the same resolved promise before either's stream
    // has started, so neither call ever sees the other's `isStreaming` flip.
    const streams = [controlledStream(), controlledStream()]
    let call = 0
    const transport: ChatTransport<UIMessage> = {
      sendMessages: async () => streams[call++].stream,
      reconnectToStream: async () => null,
    }
    const chat = new Chat<UIMessage>({
      transport,
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is on my page?' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'first answer' }] },
      ],
    })

    const p1 = chat.regenerate()
    const p2 = chat.regenerate()
    // Let both calls reach their `await transport.sendMessages(...)` before either
    // stream produces a chunk — the exact window the race needs.
    await Promise.resolve()
    await Promise.resolve()

    const [s0, s1] = streams
    s0.push({ type: 'start' })
    s1.push({ type: 'start' })
    s0.push({ type: 'start-step' })
    s1.push({ type: 'start-step' })
    s0.push({ type: 'text-start', id: 't0' })
    s1.push({ type: 'text-start', id: 't1' })
    s0.push({ type: 'text-delta', id: 't0', delta: 'first overlap answer' })
    s1.push({ type: 'text-delta', id: 't1', delta: 'second overlap answer' })
    await Promise.resolve()
    await Promise.resolve()
    s0.push({ type: 'text-delta', id: 't0', delta: ' continues' })
    s1.push({ type: 'text-delta', id: 't1', delta: ' continues' })
    await Promise.resolve()
    await Promise.resolve()
    s0.push({ type: 'text-end', id: 't0' })
    s1.push({ type: 'text-end', id: 't1' })
    s0.push({ type: 'finish-step' })
    s1.push({ type: 'finish-step' })
    s0.push({ type: 'finish' })
    s1.push({ type: 'finish' })
    s0.end()
    s1.end()
    await Promise.all([p1, p2])

    // The production symptom: ~180 duplicate-key errors from 50 messages sharing
    // only 6 ids. Two overlapping `regenerate()` calls reproduce the same shape —
    // the SDK drops one answer but keeps mutating `state.messages` by comparing
    // each stream's OWN id against whatever the OTHER stream most recently made
    // "last", so a repeated id (not just a wrong count) lands in the array: the
    // SDK itself has no serialization across `regenerate()` calls. This is the
    // confirmed cause, not a fix — the fix is `AITerminal.tsx`'s `handleAskAgain`
    // never letting a second call overlap the first (see `ask-again-overlap-gate.test.tsx`).
    const ids = assistantIds(chat)
    expect(ids.length).toBeGreaterThan(new Set(ids).size)
  })

  describe('sequential (non-overlapping) regenerate/send', () => {
    it('a question followed by two ask-agains never reuses an id between distinct answers', async () => {
      const chat = new Chat<UIMessage>({
        transport: fakeTransport(['first answer', 'second answer', 'third answer']),
      })

      await chat.sendMessage({ text: 'what is on my page?' })
      const [firstId] = assistantIds(chat)
      expect(
        chat.messages.map((m) => m.parts.map((p) => (p as { text?: string }).text).join(''))
      ).toEqual(['what is on my page?', 'first answer'])

      // Ask again: the SDK drops the answer being replaced before resending.
      await chat.regenerate()
      const idsAfterFirstRegenerate = assistantIds(chat)
      expect(idsAfterFirstRegenerate).toHaveLength(1)
      const secondId = idsAfterFirstRegenerate[0]

      await chat.regenerate()
      const idsAfterSecondRegenerate = assistantIds(chat)
      expect(idsAfterSecondRegenerate).toHaveLength(1)
      const thirdId = idsAfterSecondRegenerate[0]

      // The bug: a persisted thread showed 46 distinct answers sharing just 2 ids,
      // alternating. Each regenerate must mint an id that was never used before —
      // not just different from the immediately preceding one.
      const allIds = [firstId, secondId, thirdId]
      expect(new Set(allIds).size).toBe(allIds.length)
    })

    it('a fresh question asked right after an ask-again never reuses the regenerated answer’s id', async () => {
      const chat = new Chat<UIMessage>({
        transport: fakeTransport(['first answer', 'second answer', 'third answer']),
      })

      await chat.sendMessage({ text: 'what is on my page?' })
      await chat.regenerate()
      const [regeneratedId] = assistantIds(chat)

      await chat.sendMessage({ text: 'and now?' })
      const ids = assistantIds(chat)
      expect(ids).toHaveLength(2)
      expect(new Set(ids).size).toBe(2)
      expect(ids[0]).toBe(regeneratedId)
    })
  })
})
