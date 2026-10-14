/**
 * @jest-environment node
 *
 * Pins the KAN-284 synthetic thread fixture to the shape of the real Life 2
 * thread it stands in for (per the loop's `thread-shape.json`): 42 messages
 * in the same role sequence, and the same 24 unresolved vs. 11
 * `output-available` tool-part split. No real thread content is read here —
 * only the generator's own output.
 */

import type { UIMessage } from 'ai'
import { buildUnresolvedToolThreadFixture, UNRESOLVED_TOOL_THREAD_SHAPE } from './helpers/unresolved-tool-thread'

type ToolPart = { type: string; state: string }

const isToolPart = (part: UIMessage['parts'][number]): part is UIMessage['parts'][number] & ToolPart =>
  part.type.startsWith('tool-')

describe('unresolved-tool-thread fixture', () => {
  it('has the shape file\'s 42-message role sequence', () => {
    const messages = buildUnresolvedToolThreadFixture()

    expect(messages).toHaveLength(42)
    expect(messages.map((m) => m.role)).toEqual(UNRESOLVED_TOOL_THREAD_SHAPE.map((m) => m.role))
    expect(messages.map((m) => m.role)).toEqual([
      ...Array.from({ length: 21 }, () => ['user', 'assistant']).flat(),
    ])
  })

  it('reproduces the 24 unresolved vs. 11 output-available tool-part split', () => {
    const messages = buildUnresolvedToolThreadFixture()
    const toolParts = messages.flatMap((m) => m.parts.filter(isToolPart))

    const unresolved = toolParts.filter((part) => part.state === 'input-available')
    const outputAvailable = toolParts.filter((part) => part.state === 'output-available')

    expect(unresolved).toHaveLength(24)
    expect(outputAvailable).toHaveLength(11)
    expect(toolParts).toHaveLength(unresolved.length + outputAvailable.length)
  })

  it('carries no real thread content — every part is a neutral placeholder', () => {
    const messages = buildUnresolvedToolThreadFixture()

    for (const message of messages) {
      expect(message.id).toMatch(/^unresolved-thread-m\d+$/)
      for (const part of message.parts) {
        if (part.type === 'text') expect((part as { text: string }).text).toMatch(/^placeholder /)
        if (isToolPart(part)) {
          expect((part as unknown as { toolCallId: string }).toolCallId).toMatch(/^unresolved-thread-call-/)
          expect((part as unknown as { input: unknown }).input).toEqual({})
        }
      }
    }
  })
})
