/**
 * @jest-environment node
 *
 * Runs in the `node` environment (not jsdom) so the AI SDK's Web-stream globals
 * (TransformStream / ReadableStream, via eventsource-parser) are available.
 */

/**
 * Slice 1 — streaming-bug fix.
 *
 * A persisted transcript can carry a *dangling* client-tool call: a
 * `create_node` invocation left in the `input-available` state because the user
 * aborted the NodeCreationModal without ever producing a tool result. Replaying
 * that transcript into the model makes the prompt throw
 * `AI_MissingToolResultsError` (an assistant tool-call with no matching
 * tool-result) and the assistant reply never streams.
 *
 * These tests exercise the *real* `ai` SDK (transpiled for jest via
 * `transpilePackages` in next.config), so the sanitization behaviour — not just
 * the seam's contract — is asserted.
 */

import { convertToModelMessages, isToolUIPart } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'
import { toModelMessages } from '@/lib/conversation/transcript'

/** A transcript whose assistant turn holds a dangling create_node tool call. */
function danglingTranscript(): UIMessage[] {
  return [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'make a project called Reef' }] },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Opening the creator…' },
        {
          type: 'tool-create_node',
          toolCallId: 'tc1',
          state: 'input-available',
          input: { type: 'project', name: 'Reef' },
        },
      ],
    },
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'actually never mind — hello?' }] },
  ] as unknown as UIMessage[]
}

/** True if any model message carries a tool-call part for the given id. */
function hasToolCall(messages: ModelMessage[], toolCallId: string): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some(
        (part) =>
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          part.type === 'tool-call' &&
          'toolCallId' in part &&
          (part as { toolCallId: string }).toolCallId === toolCallId
      )
  )
}

describe('toModelMessages', () => {
  it('reproduces the bug precondition: raw SDK conversion leaves a dangling tool call', async () => {
    // convertToModelMessages itself does not throw — it faithfully emits an
    // assistant tool-call with no matching tool-result. That dangling call is
    // what later makes streamText's prompt assembly throw
    // AI_MissingToolResultsError, so the reply never streams.
    const raw = await convertToModelMessages(danglingTranscript())
    expect(hasToolCall(raw, 'tc1')).toBe(true)
  })

  it('sanitizes a dangling create_node call so replay does not throw', async () => {
    const model = await toModelMessages(danglingTranscript())

    // The dangling tool call is actually dropped...
    expect(hasToolCall(model, 'tc1')).toBe(false)
    // ...and the surrounding conversation survives (assistant text + later user turn).
    expect(model.some((m) => m.role === 'assistant')).toBe(true)
    expect(model.at(-1)?.role).toBe('user')
  })

  it('preserves a completed create_node call (with a tool result)', async () => {
    const completed = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'make a project called Reef' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-create_node',
            toolCallId: 'tc1',
            state: 'output-available',
            input: { type: 'project', name: 'Reef' },
            output: { id: 'node-1' },
          },
        ],
      },
    ] as unknown as UIMessage[]

    const model = await toModelMessages(completed)
    expect(hasToolCall(model, 'tc1')).toBe(true)
  })

  it('sanity: the dangling part is a tool UI part in input-available state', () => {
    const assistant = danglingTranscript()[1]
    const toolPart = assistant.parts.find(isToolUIPart)
    expect(toolPart).toBeDefined()
    expect((toolPart as { state?: string } | undefined)?.state).toBe('input-available')
  })
})
