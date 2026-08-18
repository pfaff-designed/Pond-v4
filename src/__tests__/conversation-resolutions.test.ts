/**
 * @jest-environment node
 *
 * Node environment (not jsdom) so the AI SDK's Web-stream globals are available
 * for the real convertToModelMessages integration checks.
 */

/**
 * Ticket-19 — proposal-card resolution persistence.
 *
 * `applyResolutions` stamps the user's Accept/Dismiss decision onto a resolved
 * proposal tool part as a synthetic tool result, so replay (toModelMessages)
 * preserves the call and the model sees what was actioned instead of
 * re-proposing it. Unresolved proposals must stay untouched — and therefore
 * still be dropped from replay exactly as before.
 */

import type { UIMessage } from 'ai'
import {
  applyResolutions,
  parseResolutions,
  emptyResolutions,
  type ConversationResolutions,
} from '@/lib/conversation/resolutions'
import { toModelMessages } from '@/lib/conversation/transcript'

function proposalTranscript(): UIMessage[] {
  return [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'make a gear page' }] },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here you go.' },
        {
          type: 'tool-create_page',
          toolCallId: 'cp1',
          state: 'input-available',
          input: { type: 'page', title: 'Camera Gear', blocks: [] },
        },
        {
          type: 'tool-propose_changes',
          toolCallId: 'pc1',
          state: 'input-available',
          input: {
            changes: [
              { op: 'create', data: { type: 'text', content: 'one' } },
              { op: 'create', data: { type: 'text', content: 'two' } },
            ],
          },
        },
      ],
    },
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'thanks' }] },
  ] as unknown as UIMessage[]
}

type ToolPart = { type: string; toolCallId: string; state: string; output?: unknown }

function findPart(messages: UIMessage[], toolCallId: string): ToolPart {
  const part = messages
    .flatMap((m) => m.parts as unknown as ToolPart[])
    .find((p) => p.toolCallId === toolCallId)
  expect(part).toBeDefined()
  return part!
}

describe('applyResolutions', () => {
  it('leaves everything untouched when nothing is resolved', () => {
    const messages = proposalTranscript()
    expect(applyResolutions(messages, emptyResolutions())).toBe(messages)
  })

  it('stamps an accepted create_page as a tool result', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      creates: { cp1: 'accepted' },
    })
    const part = findPart(out, 'cp1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    // The sibling batch with no decisions stays unresolved.
    expect(findPart(out, 'pc1').state).toBe('input-available')
  })

  it('stamps per-index propose_changes decisions, keeping undecided ones pending', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      changes: { 'pc1:1': 'rejected' },
      skipped: { pc1: 1 },
    })
    const part = findPart(out, 'pc1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({
      decisions: ['pending', 'rejected'],
      skippedOnApply: 1,
    })
  })

  it('does not mutate the input messages', () => {
    const messages = proposalTranscript()
    applyResolutions(messages, { ...emptyResolutions(), creates: { cp1: 'accepted' } })
    expect(findPart(messages, 'cp1').state).toBe('input-available')
  })

  it('ignores decisions for unknown toolCallIds', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      creates: { nope: 'accepted' },
    })
    expect(findPart(out, 'cp1').state).toBe('input-available')
  })
})

describe('applyResolutions → toModelMessages (real SDK replay)', () => {
  function toolCallIds(model: Awaited<ReturnType<typeof toModelMessages>>): string[] {
    return model.flatMap((m) =>
      Array.isArray(m.content)
        ? (m.content as Array<{ type?: string; toolCallId?: string }>)
            .filter((p) => typeof p === 'object' && p !== null && p.type === 'tool-call')
            .map((p) => p.toolCallId as string)
        : []
    )
  }

  it('a resolved proposal survives replay; an unresolved one is still dropped', async () => {
    const resolved = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      creates: { cp1: 'accepted' },
    })
    const model = await toModelMessages(resolved)
    const ids = toolCallIds(model)
    expect(ids).toContain('cp1')
    expect(ids).not.toContain('pc1')
    // The synthetic result rides along as a tool message.
    expect(model.some((m) => m.role === 'tool')).toBe(true)
  })
})

describe('parseResolutions', () => {
  it('round-trips a valid value', () => {
    const value: ConversationResolutions = {
      changes: { 'pc1:0': 'accepted' },
      creates: { cp1: 'rejected' },
      skipped: { pc1: 2 },
    }
    expect(parseResolutions(value)).toEqual(value)
  })

  it('degrades garbage to empty', () => {
    expect(parseResolutions(null)).toEqual(emptyResolutions())
    expect(parseResolutions('nope')).toEqual(emptyResolutions())
    expect(parseResolutions([1, 2])).toEqual(emptyResolutions())
  })

  it('drops malformed entries but keeps valid ones', () => {
    const parsed = parseResolutions({
      changes: { a: 'accepted', b: 'maybe', c: 7 },
      creates: 'nope',
      skipped: { x: 1, y: 'lots', z: NaN },
    })
    expect(parsed).toEqual({
      changes: { a: 'accepted' },
      creates: {},
      skipped: { x: 1 },
    })
  })
})
