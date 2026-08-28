/**
 * @jest-environment node
 *
 * Transcript round-trip with web-search parts (ticket-29 review follow-up).
 *
 * A sourced answer persists `source-url` parts and a provider-executed
 * `tool-web_search` part in the saved transcript (the chat body carries the full
 * UIMessage array back on the next turn). The reviewer traced this safe; this
 * test PINS it: after a JSON save→restore round-trip, `toModelMessages`
 * (convertToModelMessages with ignoreIncompleteToolCalls) must not throw, must
 * produce a model-message array, and must not leak `source-url` parts as broken
 * content. No live API involved.
 */

import type { UIMessage } from 'ai'
import { toModelMessages } from '@/lib/conversation/transcript'

/** An assistant message shaped like a real sourced answer from the route. */
function sourcedAssistantMessage(): UIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        // Provider-executed web search call+result, as streamed by the Anthropic
        // provider (dynamic: true, providerExecuted: true, state output-available).
        type: 'dynamic-tool',
        toolName: 'web_search',
        toolCallId: 'srvtoolu_01',
        state: 'output-available',
        input: { query: 'beginner pottery wheel prices' },
        output: [{ type: 'web_search_result', url: 'https://example.com/wheels' }],
        providerExecuted: true,
      } as unknown as UIMessage['parts'][number],
      {
        type: 'source-url',
        sourceId: 'src-1',
        url: 'https://example.com/wheels',
        title: 'Wheels Guide',
      } as unknown as UIMessage['parts'][number],
      {
        type: 'source-url',
        sourceId: 'src-2',
        url: 'https://other.example.com/prices',
      } as unknown as UIMessage['parts'][number],
      { type: 'text', text: 'Beginner wheels run $200–$700. [1][2]' },
    ],
  } as UIMessage
}

describe('transcript round-trip with source-url parts', () => {
  const messages: UIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'price of pottery wheels?' }] },
    sourcedAssistantMessage(),
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'thanks — cheapest one?' }] },
  ] as UIMessage[]

  it('survives JSON save→restore byte-identically', () => {
    const restored = JSON.parse(JSON.stringify(messages)) as UIMessage[]
    expect(restored).toEqual(messages)
    const parts = restored[1].parts as Array<{ type: string }>
    expect(parts.filter((p) => p.type === 'source-url')).toHaveLength(2)
  })

  it('converts to model messages without throwing', async () => {
    const restored = JSON.parse(JSON.stringify(messages)) as UIMessage[]
    const modelMessages = await toModelMessages(restored)
    expect(Array.isArray(modelMessages)).toBe(true)
    // The user turns and the assistant text answer survive conversion.
    expect(modelMessages.some((m) => m.role === 'user')).toBe(true)
    expect(JSON.stringify(modelMessages)).toContain('Beginner wheels run')
  })

  it('does not emit source-url as a model content type', async () => {
    const restored = JSON.parse(JSON.stringify(messages)) as UIMessage[]
    const modelMessages = await toModelMessages(restored)
    // source-url is a UI-layer citation part; the model prompt must not carry a
    // literal 'source-url' content block (convertToModelMessages maps or drops it).
    for (const m of modelMessages) {
      if (typeof m.content === 'string') continue
      for (const c of m.content as Array<{ type: string }>) {
        expect(c.type).not.toBe('source-url')
      }
    }
  })
})
